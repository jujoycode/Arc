package io.arcapp.backend.issue.internal.persistence

import io.arcapp.backend.shared.persistence.dbQuery
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.springframework.stereotype.Repository
import java.math.BigDecimal
import java.time.ZoneOffset

@Repository
class SprintIssueRepository {
    private fun members(projectId: Long, sprintId: Long) = (Issues.projectId eq projectId) and (Issues.sprintId eq sprintId) and Issues.deletedAt.isNull()
    // MySQL CAST supports DECIMAL, whereas casting to BIGINT is invalid SQL.
    // Widen before SUM so many integer point values cannot overflow on reading.
    private val points = coalesce(Issues.storyPoints.castTo<BigDecimal>(DecimalColumnType(20, 0)), decimalLiteral(BigDecimal.ZERO))
    fun totals(projectId: Long, sprintId: Long): Map<String, Any?> = dbQuery {
        val count = Issues.id.count()
        val total = points.sum()
        val row = Issues.select(count, total).where(members(projectId, sprintId)).single()
        mapOf("issueCount" to row[count], "storyPoints" to (row[total]?.toLong() ?: 0L))
    }
    fun recordResult(projectId: Long, sprintId: Long) = dbQuery {
        SprintHistory.insert(
            Issues.select(longLiteral(sprintId), Issues.id, Issues.status, Issues.storyPoints).where(members(projectId, sprintId)),
            columns = listOf(SprintHistory.sprintId, SprintHistory.issueId, SprintHistory.status, SprintHistory.points),
        )
        Unit
    }
    fun summary(projectId: Long, sprintId: Long): Map<String, Any?> = dbQuery {
        val count = Issues.id.count()
        val done = case().When(Issues.status eq "DONE", longLiteral(1)).Else(longLiteral(0)).sum()
        val totalPoints = points.sum()
        val donePoints = case().When(Issues.status eq "DONE", points).Else(decimalLiteral(BigDecimal.ZERO)).sum()
        val remaining = case().When(Issues.status neq "DONE", points).Else(decimalLiteral(BigDecimal.ZERO)).sum()
        val row = Issues.select(count, done, totalPoints, donePoints, remaining).where(members(projectId, sprintId)).single()
        mapOf("issueCount" to row[count], "doneCount" to (row[done] ?: 0L), "storyPoints" to (row[totalPoints]?.toLong() ?: 0L), "donePoints" to (row[donePoints]?.toLong() ?: 0L), "remainingPoints" to (row[remaining]?.toLong() ?: 0L))
    }
    fun moveAfterClose(actorId: Long, projectId: Long, sprintId: Long, nextSprintId: Long?) = dbQuery {
        IssueActivities.insert(
            Issues.select(Issues.id, longLiteral(actorId), stringLiteral("SPRINT_CHANGED")).where(members(projectId, sprintId)),
            columns = listOf(IssueActivities.issueId, IssueActivities.actorId, IssueActivities.type),
        )
        Issues.update({ members(projectId, sprintId) and (Issues.status neq "DONE") }) { it[Issues.sprintId] = nextSprintId; it[version] = Issues.version + 1 }
        Issues.update({ members(projectId, sprintId) }) { it[Issues.sprintId] = null; it[version] = Issues.version + 1 }
        Unit
    }
    fun history(sprintId: Long): List<Map<String, Any?>> = dbQuery {
        SprintHistory.join(Issues, JoinType.INNER, SprintHistory.issueId, Issues.id).join(IssueProjects, JoinType.INNER, Issues.projectId, IssueProjects.id)
            .select(SprintHistory.columns + listOf(Issues.number, Issues.title, IssueProjects.key)).where { SprintHistory.sprintId eq sprintId }
            .orderBy(SprintHistory.issueId)
            .map { mapOf("issueId" to it[SprintHistory.issueId], "key" to "${it[IssueProjects.key]}-${it[Issues.number]}", "title" to it[Issues.title], "finalStatus" to it[SprintHistory.status], "finalStoryPoints" to it[SprintHistory.points], "recordedAt" to it[SprintHistory.recordedAt].toInstant(ZoneOffset.UTC)) }
    }
    fun assign(projectId: Long, issueId: Long, sprintId: Long?) = dbQuery {
        Issues.update({ (Issues.id eq issueId) and (Issues.projectId eq projectId) and Issues.deletedAt.isNull() }) { it[Issues.sprintId] = sprintId; it[version] = Issues.version + 1 }
    }
    fun reorder(projectId: Long, issueId: Long, index: Int) = dbQuery {
        Issues.update({ (Issues.id eq issueId) and (Issues.projectId eq projectId) and Issues.sprintId.isNull() and Issues.deletedAt.isNull() }) { it[sortOrder] = index.toLong(); it[version] = Issues.version + 1 }
    }
}
