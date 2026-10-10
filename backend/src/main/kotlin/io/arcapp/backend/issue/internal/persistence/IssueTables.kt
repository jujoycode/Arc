package io.arcapp.backend.issue.internal.persistence

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.javatime.date
import org.jetbrains.exposed.v1.javatime.datetime

internal object Issues : Table("issues") {
    val id = long("id").autoIncrement()
    val projectId = long("project_id")
    val number = integer("issue_number")
    val title = varchar("title", 200)
    val description = text("description").nullable()
    val type = varchar("issue_type", 16)
    val status = varchar("status", 16)
    val priority = varchar("priority", 16)
    val reporterId = long("reporter_id")
    val assigneeId = long("assignee_id").nullable()
    val startDate = date("start_date").nullable()
    val dueDate = date("due_date").nullable()
    val progress = short("done_ratio").default(0)
    val storyPoints = integer("story_points").nullable()
    val parentId = long("parent_issue_id").nullable()
    val versionId = long("version_id").nullable()
    val customFields = text("custom_fields").databaseGenerated()
    val sprintId = long("sprint_id").nullable()
    val sortOrder = long("sort_order").default(0)
    val version = long("version").default(0)
    val deletedAt = datetime("deleted_at").nullable()
    val createdAt = datetime("created_at").databaseGenerated()
    val updatedAt = datetime("updated_at").databaseGenerated()
    override val primaryKey = PrimaryKey(id)
}
internal object IssueActivities : Table("issue_activities") {
    val id = long("id").autoIncrement()
    val issueId = long("issue_id")
    val actorId = long("actor_id")
    val type = varchar("event_type", 40)
    val createdAt = datetime("created_at").databaseGenerated()
    override val primaryKey = PrimaryKey(id)
}
internal object IssueRelations : Table("issue_relations") {
    val id = long("id").autoIncrement()
    val projectId = long("project_id")
    val sourceId = long("source_issue_id")
    val targetId = long("target_issue_id")
    val type = varchar("relation_type", 16)
    val lagDays = integer("lag_days").default(0)
    override val primaryKey = PrimaryKey(id)
}
internal object IssueComments : Table("comments") {
    val id = long("id").autoIncrement()
    val issueId = long("issue_id")
    val authorId = long("author_id")
    val body = text("body")
    val deletedAt = datetime("deleted_at").nullable()
    val createdAt = datetime("created_at").databaseGenerated()
    val updatedAt = datetime("updated_at").databaseGenerated()
    override val primaryKey = PrimaryKey(id)
}
internal object SprintHistory : Table("sprint_issue_history") {
    val sprintId = long("sprint_id")
    val issueId = long("issue_id")
    val status = varchar("final_status", 16)
    val points = integer("final_story_points").nullable()
    val recordedAt = datetime("recorded_at").databaseGenerated()
    override val primaryKey = PrimaryKey(sprintId, issueId)
}
/** Read projections; project and identity retain the corresponding write responsibilities. */
internal object IssueProjects : Table("projects") { val id = long("id"); val key = varchar("project_key", 10) }
internal object IssueUsers : Table("users") { val id = long("id"); val displayName = varchar("display_name", 120) }
