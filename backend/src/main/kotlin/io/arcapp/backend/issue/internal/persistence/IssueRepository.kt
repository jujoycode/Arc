package io.arcapp.backend.issue.internal.persistence

import io.arcapp.backend.issue.internal.IssueInput
import io.arcapp.backend.issue.internal.IssueSearch
import io.arcapp.backend.shared.persistence.insert
import io.arcapp.backend.shared.persistence.one
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.Date

@Repository
class IssueRepository(private val jdbc: JdbcTemplate) {
    private val projection = "SELECT i.id,i.project_id AS projectId,CONCAT(p.project_key,'-',i.issue_number) AS `key`,i.issue_number AS number,i.title,i.description,i.issue_type AS type,i.status,i.priority,i.reporter_id AS reporterId,i.assignee_id AS assigneeId,u.display_name AS assigneeName,i.start_date AS startDate,i.due_date AS dueDate,i.done_ratio AS progress,i.story_points AS storyPoints,i.parent_issue_id AS parentId,i.version_id AS versionId,i.sprint_id AS sprintId,i.sort_order AS sortOrder,i.version,i.created_at AS createdAt,i.updated_at AS updatedAt FROM issues i JOIN projects p ON p.id=i.project_id LEFT JOIN users u ON u.id=i.assignee_id WHERE i.deleted_at IS NULL"
    private val sortColumns = mapOf("updatedAt" to "i.updated_at", "key" to "i.issue_number", "title" to "i.title", "type" to "i.issue_type", "status" to "i.status", "priority" to "i.priority", "assigneeName" to "u.display_name", "dueDate" to "i.due_date")

    fun supportsSort(sort: String) = sort in sortColumns
    fun list(projectId: Long, criteria: IssueSearch): Map<String, Any> {
        val clauses = mutableListOf("i.project_id=?")
        val args = mutableListOf<Any>(projectId)
        with(criteria) {
            if (!search.isNullOrBlank()) { clauses += "(LOWER(i.title) LIKE ? OR LOWER(CONCAT(p.project_key,'-',i.issue_number)) LIKE ?)"; args += "%${search.lowercase()}%"; args += "%${search.lowercase()}%" }
            if (!status.isNullOrBlank()) { clauses += "i.status=?"; args += status }
            if (!type.isNullOrBlank()) { clauses += "i.issue_type=?"; args += type }
            if (assigneeId != null) { clauses += "i.assignee_id=?"; args += assigneeId }
            if (!priority.isNullOrBlank()) { clauses += "i.priority=?"; args += priority }
            if (versionId != null) { clauses += "i.version_id=?"; args += versionId }
            if (sprintId != null) { clauses += "i.sprint_id=?"; args += sprintId }
            if (sprintState == "BACKLOG") clauses += "i.sprint_id IS NULL"
            if (sprintState == "ASSIGNED") clauses += "i.sprint_id IS NOT NULL"
            val where = clauses.joinToString(" AND ")
            val total = jdbc.queryForObject("SELECT COUNT(*) FROM issues i JOIN projects p ON p.id=i.project_id WHERE i.deleted_at IS NULL AND $where", Long::class.java, *args.toTypedArray()) ?: 0
            val limit = size.coerceIn(1, 1000)
            val currentPage = page.coerceAtLeast(0)
            val items = jdbc.queryForList("$projection AND $where ORDER BY ${sortColumns.getValue(sort)} ${direction.uppercase()},i.id DESC LIMIT ? OFFSET ?", *(args + listOf(limit, currentPage.toLong() * limit)).toTypedArray())
            return mapOf("items" to items, "total" to total, "page" to currentPage, "size" to limit)
        }
    }
    fun find(projectId: Long, id: Long) = jdbc.one("SELECT * FROM issues WHERE id=? AND project_id=? AND deleted_at IS NULL", id, projectId)
    fun detail(projectId: Long, id: Long) = jdbc.one("$projection AND i.project_id=? AND i.id=?", projectId, id)
    fun create(projectId: Long, number: Int, actorId: Long, input: IssueInput): Long = with(input) {
        jdbc.insert("INSERT INTO issues(project_id,issue_number,title,description,issue_type,status,priority,reporter_id,assignee_id,start_date,due_date,done_ratio,story_points,parent_issue_id,version_id,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            projectId, number, title.trim(), description, type, status, priority, actorId, assigneeId, startDate?.let(Date::valueOf), dueDate?.let(Date::valueOf), progress, storyPoints, parentId, versionId, number)
    }
    fun update(projectId: Long, id: Long, input: IssueInput, expectedVersion: Long): Int = with(input) {
        jdbc.update("UPDATE issues SET title=?,description=?,issue_type=?,status=?,priority=?,assignee_id=?,start_date=?,due_date=?,done_ratio=?,story_points=?,parent_issue_id=?,version_id=?,version=version+1 WHERE id=? AND project_id=? AND version=? AND deleted_at IS NULL",
            title.trim(), description, type, status, priority, assigneeId, startDate?.let(Date::valueOf), dueDate?.let(Date::valueOf), progress, storyPoints, parentId, versionId, id, projectId, expectedVersion)
    }
    fun status(projectId: Long, id: Long, status: String, expectedVersion: Long) = jdbc.update("UPDATE issues SET status=?,version=version+1 WHERE id=? AND project_id=? AND version=? AND deleted_at IS NULL", status, id, projectId, expectedVersion)
    fun delete(id: Long) { jdbc.update("UPDATE issues SET deleted_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=?", id) }
    fun childTypes(id: Long) = jdbc.queryForList("SELECT issue_type FROM issues WHERE parent_issue_id=? AND deleted_at IS NULL", id).map { it["issue_type"] as String }
    fun activity(id: Long, actorId: Long, event: String) { jdbc.update("INSERT INTO issue_activities(issue_id,actor_id,event_type) VALUES(?,?,?)", id, actorId, event) }
    fun activities(id: Long) = jdbc.queryForList("SELECT a.id,a.event_type AS type,u.display_name AS actorName,a.created_at AS createdAt FROM issue_activities a JOIN users u ON u.id=a.actor_id WHERE a.issue_id=? ORDER BY a.id DESC", id)
    fun relations(projectIds: Set<Long>): List<Map<String, Any?>> {
        val marks = List(projectIds.size) { "?" }.joinToString(",")
        return jdbc.queryForList("SELECT r.id,r.source_issue_id AS fromId,r.target_issue_id AS toId,r.relation_type AS type,r.lag_days AS lagDays FROM issue_relations r JOIN issues a ON a.id=r.source_issue_id JOIN issues b ON b.id=r.target_issue_id WHERE r.project_id IN ($marks) AND a.deleted_at IS NULL AND b.deleted_at IS NULL", *projectIds.toTypedArray())
    }
    fun createRelation(projectId: Long, id: Long, targetId: Long, type: String) = jdbc.insert("INSERT INTO issue_relations(project_id,source_issue_id,target_issue_id,relation_type) VALUES(?,?,?,?)", projectId, id, targetId, type)
    fun deleteRelation(projectId: Long, id: Long) { jdbc.update("DELETE FROM issue_relations WHERE id=? AND project_id=?", id, projectId) }
    fun comment(projectId: Long, id: Long) = jdbc.one("SELECT c.* FROM comments c JOIN issues i ON i.id=c.issue_id WHERE c.id=? AND i.project_id=? AND c.deleted_at IS NULL AND i.deleted_at IS NULL", id, projectId)
    fun comments(id: Long) = jdbc.queryForList("SELECT c.id,c.body,c.author_id AS authorId,u.display_name AS authorName,c.created_at AS createdAt,c.updated_at AS updatedAt FROM comments c JOIN users u ON u.id=c.author_id WHERE c.issue_id=? AND c.deleted_at IS NULL ORDER BY c.created_at", id)
    fun addComment(id: Long, actorId: Long, body: String) = jdbc.insert("INSERT INTO comments(issue_id,author_id,body) VALUES(?,?,?)", id, actorId, body)
    fun editComment(id: Long, body: String) { jdbc.update("UPDATE comments SET body=? WHERE id=?", body, id) }
    fun deleteComment(id: Long) { jdbc.update("UPDATE comments SET deleted_at=UTC_TIMESTAMP(6) WHERE id=?", id) }
    fun timeline(projectIds: Set<Long>): List<Map<String, Any?>> {
        val marks = List(projectIds.size) { "?" }.joinToString(",")
        return jdbc.queryForList("$projection AND i.project_id IN ($marks) ORDER BY i.project_id,i.issue_number", *projectIds.toTypedArray())
    }
}
