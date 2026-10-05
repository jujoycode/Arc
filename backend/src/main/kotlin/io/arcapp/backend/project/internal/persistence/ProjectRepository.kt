package io.arcapp.backend.project.internal.persistence

import io.arcapp.backend.shared.persistence.dbQuery
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.springframework.stereotype.Repository
import java.sql.Date
import java.time.Clock
import java.time.LocalDateTime

private fun ResultRow.raw(): Map<String, Any?> = mapOf(
    "id" to this[Projects.id], "workspace_id" to this[Projects.workspaceId], "parent_project_id" to this[Projects.parentId],
    "name" to this[Projects.name], "project_key" to this[Projects.key], "next_issue_number" to this[Projects.nextIssueNumber],
    "description" to this[Projects.description], "archived_at" to this[Projects.archivedAt],
)
private fun ResultRow.view(): Map<String, Any?> = mapOf(
    "id" to this[Projects.id], "workspaceId" to this[Projects.workspaceId], "parentProjectId" to this[Projects.parentId],
    "name" to this[Projects.name], "key" to this[Projects.key], "nextIssueNumber" to this[Projects.nextIssueNumber],
    "description" to this[Projects.description], "archivedAt" to this[Projects.archivedAt],
)
private fun ResultRow.version(): Map<String, Any?> = mapOf(
    "id" to this[Versions.id], "projectId" to this[Versions.projectId], "name" to this[Versions.name], "description" to this[Versions.description],
    "startDate" to this[Versions.startDate], "dueDate" to this[Versions.dueDate], "status" to this[Versions.status],
)

@Repository
class ProjectRepository {
    fun find(id: Long) = dbQuery { Projects.selectAll().where { Projects.id eq id }.firstOrNull()?.raw() }
    fun view(id: Long) = dbQuery { Projects.selectAll().where { Projects.id eq id }.firstOrNull()?.view() }
    fun list(workspaceId: Long) = dbQuery { Projects.selectAll().where { Projects.workspaceId eq workspaceId }.orderBy(Projects.name to SortOrder.ASC, Projects.id to SortOrder.ASC).map { it.view() } }
    fun create(workspaceId: Long, parentId: Long?, name: String, key: String, description: String?): Long = dbQuery {
        Projects.insert { it[Projects.workspaceId] = workspaceId; it[Projects.parentId] = parentId; it[Projects.name] = name; it[Projects.key] = key; it[Projects.description] = description }[Projects.id]
    }
    fun lockWorkspace(workspaceId: Long) = dbQuery { ProjectWorkspaces.selectAll().where { ProjectWorkspaces.id eq workspaceId }.forUpdate().firstOrNull(); Unit }
    fun lock(id: Long) = dbQuery { Projects.selectAll().where { Projects.id eq id }.forUpdate().first().raw() }
    fun allocateIssueNumber(id: Long): Int = dbQuery {
        val number = (lock(id)["next_issue_number"] as Number).toInt()
        Projects.update({ Projects.id eq id }) { it[nextIssueNumber] = nextIssueNumber + 1 }
        number
    }
    fun containsVersion(projectId: Long, versionId: Long): Boolean = dbQuery { Versions.select(Versions.id).where { (Versions.id eq versionId) and (Versions.projectId eq projectId) }.any() }
    fun update(id: Long, name: String, key: String, description: String?, parentId: Long?, archived: Boolean) = dbQuery {
        Projects.update({ Projects.id eq id }) { it[Projects.name] = name; it[Projects.key] = key; it[Projects.description] = description; it[Projects.parentId] = parentId; it[archivedAt] = if (archived) LocalDateTime.now(Clock.systemUTC()) else null }
        Unit
    }
    fun versions(id: Long) = dbQuery { Versions.selectAll().where { Versions.projectId eq id }.orderBy(Versions.dueDate to SortOrder.ASC, Versions.id to SortOrder.ASC).map { it.version() } }
    fun createVersion(projectId: Long, name: String, description: String?, startDate: Date?, dueDate: Date): Long = dbQuery {
        Versions.insert { it[Versions.projectId] = projectId; it[Versions.name] = name; it[Versions.description] = description; it[Versions.startDate] = startDate?.toLocalDate(); it[Versions.dueDate] = dueDate.toLocalDate() }[Versions.id]
    }
    fun versionsFor(ids: Set<Long>): List<Map<String, Any?>> = dbQuery {
        if (ids.isEmpty()) emptyList() else Versions.selectAll().where { Versions.projectId inList ids }.orderBy(Versions.dueDate to SortOrder.ASC, Versions.id to SortOrder.ASC).map { it.version() }
    }
}
