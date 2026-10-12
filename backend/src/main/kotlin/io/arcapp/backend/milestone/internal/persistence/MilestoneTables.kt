package io.arcapp.backend.milestone.internal.persistence

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.javatime.date
import org.jetbrains.exposed.v1.javatime.datetime

internal object Milestones : Table("milestones") {
    val id = long("id").autoIncrement()
    val projectId = long("project_id")
    val title = varchar("title", 120)
    val targetDate = date("target_date")
    val criteria = text("criteria")
    val description = text("description").nullable()
    val ownerId = long("owner_id").nullable()
    val versionId = long("version_id").nullable()
    val status = varchar("status", 16)
    val revision = long("revision")
    val createdAt = datetime("created_at")
    val updatedAt = datetime("updated_at")
    override val primaryKey = PrimaryKey(id)
}
internal object MilestoneActivities : Table("milestone_activities") {
    val id = long("id").autoIncrement()
    val milestoneId = long("milestone_id")
    val actorId = long("actor_id")
    val type = varchar("event_type", 16)
    val payload = text("payload")
    val createdAt = datetime("created_at")
    override val primaryKey = PrimaryKey(id)
}
/** Identity owns users; this projection supplies current display names only. */
internal object MilestoneActors : Table("users") {
    val id = long("id")
    val displayName = varchar("display_name", 120)
}
