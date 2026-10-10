package io.arcapp.backend.issue.internal.persistence

import io.arcapp.backend.issue.internal.ExecutionInput
import io.arcapp.backend.issue.internal.IssueInput
import io.arcapp.backend.issue.internal.IssueSearch
import io.arcapp.backend.shared.persistence.dbQuery
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.springframework.stereotype.Repository
import java.time.Clock
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import tools.jackson.core.type.TypeReference
import tools.jackson.databind.json.JsonMapper

private fun utcNow() = LocalDateTime.now(Clock.systemUTC())
private val fieldJson = JsonMapper.builder().build()
private fun decodeCustomFields(value: String): Map<String, Any?> = fieldJson.readValue(value, object : TypeReference<Map<String, Any?>>() {})
private fun ResultRow.rawIssue(): Map<String, Any?> = Issues.columns.associate { it.name to this[it] } + mapOf("custom_fields" to decodeCustomFields(this[Issues.customFields]))
private fun ResultRow.issueView(): Map<String, Any?> = mapOf(
    "id" to this[Issues.id], "projectId" to this[Issues.projectId], "key" to "${this[IssueProjects.key]}-${this[Issues.number]}",
    "number" to this[Issues.number], "title" to this[Issues.title], "description" to this[Issues.description], "type" to this[Issues.type],
    "status" to this[Issues.status], "priority" to this[Issues.priority], "reporterId" to this[Issues.reporterId],
    "assigneeId" to this[Issues.assigneeId], "assigneeName" to getOrNull(IssueUsers.displayName),
    "startDate" to this[Issues.startDate], "dueDate" to this[Issues.dueDate], "progress" to this[Issues.progress],
    "storyPoints" to this[Issues.storyPoints], "parentId" to this[Issues.parentId], "versionId" to this[Issues.versionId],
    "sprintId" to this[Issues.sprintId], "sortOrder" to this[Issues.sortOrder], "version" to this[Issues.version],
    "customFields" to decodeCustomFields(this[Issues.customFields]),
    "createdAt" to this[Issues.createdAt].toInstant(ZoneOffset.UTC), "updatedAt" to this[Issues.updatedAt].toInstant(ZoneOffset.UTC),
)

@Repository
class IssueRepository {
    private val joined = Issues.join(IssueProjects, JoinType.INNER, Issues.projectId, IssueProjects.id)
        .join(IssueUsers, JoinType.LEFT, Issues.assigneeId, IssueUsers.id)
    private val projection = Issues.columns + listOf(IssueProjects.key, IssueUsers.displayName)
    private val sortColumns: Map<String, Expression<*>> = mapOf(
        "updatedAt" to Issues.updatedAt, "key" to Issues.number, "title" to Issues.title, "type" to Issues.type,
        "status" to Issues.status, "priority" to Issues.priority, "assigneeName" to IssueUsers.displayName, "dueDate" to Issues.dueDate,
        "startDate" to Issues.startDate, "progress" to Issues.progress, "storyPoints" to Issues.storyPoints,
    )
    fun supportsSort(sort: String) = sort in sortColumns
    fun findNumbers(projectId: Long, numbers: Set<Int>): Map<Int, Long> = dbQuery {
        if (numbers.isEmpty()) emptyMap() else Issues.select(Issues.number, Issues.id)
            .where { (Issues.projectId eq projectId) and (Issues.number inList numbers) and Issues.deletedAt.isNull() }.associate { it[Issues.number] to it[Issues.id] }
    }
    private fun searchCondition(projectId: Long, search: IssueSearch): Op<Boolean> {
        val conditions = mutableListOf<Op<Boolean>>(Issues.projectId eq projectId, Issues.deletedAt.isNull())
        with(search) {
            if (!this.search.isNullOrBlank()) {
                val key = CustomFunction<String>("CONCAT", TextColumnType(), IssueProjects.key, stringLiteral("-"), Issues.number)
                val pattern = "%${this.search.lowercase()}%"
                conditions += (Issues.title.lowerCase() like pattern) or (key.lowerCase() like pattern)
            }
            if (!status.isNullOrBlank()) conditions += Issues.status eq status
            if (!type.isNullOrBlank()) conditions += Issues.type eq type
            if (assigneeId != null) conditions += Issues.assigneeId eq assigneeId
            if (!priority.isNullOrBlank()) conditions += Issues.priority eq priority
            if (versionId != null) conditions += Issues.versionId eq versionId
            if (sprintId != null) conditions += Issues.sprintId eq sprintId
            if (sprintState == "BACKLOG") conditions += Issues.sprintId.isNull()
            if (sprintState == "ASSIGNED") conditions += Issues.sprintId.isNotNull()
        }
        return conditions.reduce { a, b -> a and b }
    }
    fun list(projectId: Long, criteria: IssueSearch): Map<String, Any> = dbQuery {
        val condition = searchCondition(projectId, criteria)
        val count = Issues.id.count()
        val total = joined.select(count).where(condition).single()[count]
        val size = criteria.size.coerceIn(1, 1000)
        val page = criteria.page.coerceAtLeast(0)
        val items = joined.select(projection).where(condition)
            .orderBy(sortColumns.getValue(criteria.sort) to if (criteria.direction == "asc") SortOrder.ASC else SortOrder.DESC, Issues.id to SortOrder.DESC)
            .limit(size).offset(page.toLong() * size).map { it.issueView() }
        mapOf("items" to items, "total" to total, "page" to page, "size" to size)
    }
    private fun active(projectId: Long, id: Long) = (Issues.id eq id) and (Issues.projectId eq projectId) and Issues.deletedAt.isNull()
    fun find(projectId: Long, id: Long) = dbQuery { Issues.selectAll().where(active(projectId, id)).firstOrNull()?.rawIssue() }
    fun detail(projectId: Long, id: Long) = dbQuery { joined.select(projection).where(active(projectId, id)).firstOrNull()?.issueView() }
    fun create(projectId: Long, number: Int, actorId: Long, input: IssueInput): Long = dbQuery {
        Issues.insert {
            it[Issues.projectId] = projectId; it[Issues.number] = number; it[reporterId] = actorId; it[sortOrder] = number.toLong()
            it[title] = input.title.trim(); it[description] = input.description; it[type] = input.type; it[status] = input.status; it[priority] = input.priority
            it[assigneeId] = input.assigneeId; it[startDate] = input.startDate?.let(LocalDate::parse); it[dueDate] = input.dueDate?.let(LocalDate::parse)
            it[progress] = input.progress.toShort(); it[storyPoints] = input.storyPoints; it[parentId] = input.parentId; it[versionId] = input.versionId
            it[customFields] = fieldJson.writeValueAsString(input.customFields ?: emptyMap<String, Any?>())
        }[Issues.id]
    }
    fun update(projectId: Long, id: Long, input: IssueInput, expectedVersion: Long): Int = dbQuery {
        Issues.update({ active(projectId, id) and (Issues.version eq expectedVersion) }) {
            it[title] = input.title.trim(); it[description] = input.description; it[type] = input.type; it[status] = input.status; it[priority] = input.priority
            it[assigneeId] = input.assigneeId; it[startDate] = input.startDate?.let(LocalDate::parse); it[dueDate] = input.dueDate?.let(LocalDate::parse)
            it[progress] = input.progress.toShort(); it[storyPoints] = input.storyPoints; it[parentId] = input.parentId; it[versionId] = input.versionId
            it[customFields] = fieldJson.writeValueAsString(input.customFields ?: emptyMap<String, Any?>())
            it[version] = Issues.version + 1
        }
    }
    fun status(projectId: Long, id: Long, status: String, expectedVersion: Long) = dbQuery {
        Issues.update({ active(projectId, id) and (Issues.version eq expectedVersion) }) { it[Issues.status] = status; it[version] = Issues.version + 1 }
    }
    fun execution(projectId: Long, id: Long, input: ExecutionInput, expectedVersion: Long) = dbQuery {
        Issues.update({ active(projectId, id) and (Issues.version eq expectedVersion) }) {
            it[status] = input.status; it[progress] = input.progress.toShort(); it[version] = Issues.version + 1
        }
    }
    fun delete(id: Long) = dbQuery { Issues.update({ Issues.id eq id }) { it[deletedAt] = utcNow(); it[version] = Issues.version + 1 }; Unit }
    fun childTypes(id: Long) = dbQuery { Issues.select(Issues.type).where { (Issues.parentId eq id) and Issues.deletedAt.isNull() }.map { it[Issues.type] } }
    fun activity(id: Long, actorId: Long, event: String) = dbQuery { IssueActivities.insert { it[issueId] = id; it[IssueActivities.actorId] = actorId; it[type] = event }; Unit }
    fun activities(id: Long): List<Map<String, Any?>> = dbQuery {
        IssueActivities.join(IssueUsers, JoinType.INNER, IssueActivities.actorId, IssueUsers.id)
            .select(IssueActivities.id, IssueActivities.type, IssueUsers.displayName, IssueActivities.createdAt)
            .where { IssueActivities.issueId eq id }.orderBy(IssueActivities.id to SortOrder.DESC)
            .map { mapOf("id" to it[IssueActivities.id], "type" to it[IssueActivities.type], "actorName" to it[IssueUsers.displayName], "createdAt" to it[IssueActivities.createdAt].toInstant(ZoneOffset.UTC)) }
    }
    fun relations(projectIds: Set<Long>): List<Map<String, Any?>> = dbQuery {
        if (projectIds.isEmpty()) return@dbQuery emptyList()
        val source = Issues.alias("source")
        val target = Issues.alias("target")
        IssueRelations.join(source, JoinType.INNER, IssueRelations.sourceId, source[Issues.id]).join(target, JoinType.INNER, IssueRelations.targetId, target[Issues.id])
            .select(IssueRelations.columns).where { (IssueRelations.projectId inList projectIds) and source[Issues.deletedAt].isNull() and target[Issues.deletedAt].isNull() }
            .map { mapOf("id" to it[IssueRelations.id], "fromId" to it[IssueRelations.sourceId], "toId" to it[IssueRelations.targetId], "type" to it[IssueRelations.type], "lagDays" to it[IssueRelations.lagDays]) }
    }
    fun createRelation(projectId: Long, id: Long, targetId: Long, type: String) = dbQuery {
        IssueRelations.insert { it[IssueRelations.projectId] = projectId; it[sourceId] = id; it[IssueRelations.targetId] = targetId; it[IssueRelations.type] = type }[IssueRelations.id]
    }
    fun deleteRelation(projectId: Long, id: Long) = dbQuery { IssueRelations.deleteWhere { (IssueRelations.id eq id) and (IssueRelations.projectId eq projectId) }; Unit }
    fun comment(projectId: Long, id: Long): Map<String, Any?>? = dbQuery {
        IssueComments.join(Issues, JoinType.INNER, IssueComments.issueId, Issues.id).select(IssueComments.columns)
            .where { (IssueComments.id eq id) and (Issues.projectId eq projectId) and IssueComments.deletedAt.isNull() and Issues.deletedAt.isNull() }
            .firstOrNull()?.let { row -> IssueComments.columns.associate { it.name to row[it] } }
    }
    fun comments(id: Long): List<Map<String, Any?>> = dbQuery {
        IssueComments.join(IssueUsers, JoinType.INNER, IssueComments.authorId, IssueUsers.id)
            .select(IssueComments.columns + IssueUsers.displayName).where { (IssueComments.issueId eq id) and IssueComments.deletedAt.isNull() }.orderBy(IssueComments.createdAt)
            .map { mapOf("id" to it[IssueComments.id], "body" to it[IssueComments.body], "authorId" to it[IssueComments.authorId], "authorName" to it[IssueUsers.displayName], "createdAt" to it[IssueComments.createdAt].toInstant(ZoneOffset.UTC), "updatedAt" to it[IssueComments.updatedAt].toInstant(ZoneOffset.UTC)) }
    }
    fun addComment(id: Long, actorId: Long, body: String) = dbQuery { IssueComments.insert { it[issueId] = id; it[authorId] = actorId; it[IssueComments.body] = body }[IssueComments.id] }
    fun editComment(id: Long, body: String) = dbQuery { IssueComments.update({ IssueComments.id eq id }) { it[IssueComments.body] = body }; Unit }
    fun deleteComment(id: Long) = dbQuery { IssueComments.update({ IssueComments.id eq id }) { it[deletedAt] = utcNow() }; Unit }
    fun timeline(projectIds: Set<Long>): List<Map<String, Any?>> = dbQuery {
        if (projectIds.isEmpty()) emptyList() else joined.select(projection).where { (Issues.projectId inList projectIds) and Issues.deletedAt.isNull() }
            .orderBy(Issues.projectId to SortOrder.ASC, Issues.number to SortOrder.ASC).map { it.issueView() }
    }
}
