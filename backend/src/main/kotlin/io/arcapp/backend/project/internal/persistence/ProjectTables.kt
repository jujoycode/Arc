package io.arcapp.backend.project.internal.persistence

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.javatime.date
import org.jetbrains.exposed.v1.javatime.datetime

internal object Projects : Table("projects") {
    val id = long("id").autoIncrement()
    val workspaceId = long("workspace_id")
    val parentId = long("parent_project_id").nullable()
    val name = varchar("name", 120)
    val key = varchar("project_key", 10)
    val nextIssueNumber = integer("next_issue_number").default(1)
    val description = text("description").nullable()
    val archivedAt = datetime("archived_at").nullable()
    override val primaryKey = PrimaryKey(id)
}
internal object ProjectManagers : Table("project_managers") {
    val projectId = long("project_id")
    val workspaceId = long("workspace_id")
    val userId = long("user_id")
    override val primaryKey = PrimaryKey(projectId, userId)
}
internal object Versions : Table("versions") {
    val id = long("id").autoIncrement()
    val projectId = long("project_id")
    val name = varchar("name", 120)
    val description = text("description").nullable()
    val startDate = date("start_date").nullable()
    val dueDate = date("due_date")
    val status = varchar("status", 16).default("OPEN")
    override val primaryKey = PrimaryKey(id)
}
/** Workspace lock projection; membership writes belong to workspace. */
internal object ProjectWorkspaces : Table("workspaces") { val id = long("id"); val deletedAt = datetime("deleted_at").nullable() }
