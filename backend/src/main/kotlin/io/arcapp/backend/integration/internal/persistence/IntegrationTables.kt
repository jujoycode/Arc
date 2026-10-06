package io.arcapp.backend.integration.internal.persistence

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.javatime.datetime

internal object Connections : Table("repository_connections") {
    val id = long("id").autoIncrement()
    val projectId = long("project_id")
    val provider = varchar("provider", 16)
    val repositoryId = long("repository_id")
    val slug = varchar("repository_slug", 240)
    val status = varchar("status", 16).default("ACTIVE")
    val token = text("encrypted_token").nullable()
    val secret = text("encrypted_secret").nullable()
    val createdAt = datetime("created_at").databaseGenerated()
    override val primaryKey = PrimaryKey(id)
}
internal object DevelopmentLinks : Table("development_links") {
    val id = long("id").autoIncrement()
    val issueId = long("issue_id")
    val connectionId = long("connection_id")
    val externalId = varchar("external_id", 100)
    val kind = varchar("kind", 24)
    val title = varchar("title", 200)
    val state = varchar("state", 24)
    val url = varchar("url", 512)
    val sourceUpdatedAt = datetime("source_updated_at").nullable()
    val createdAt = datetime("created_at").databaseGenerated()
    val updatedAt = datetime("updated_at").databaseGenerated()
    override val primaryKey = PrimaryKey(id)
}
internal object Deliveries : Table("webhook_deliveries") {
    val id = long("id").autoIncrement()
    val connectionId = long("connection_id")
    val deliveryId = varchar("delivery_id", 128)
    val event = varchar("event_type", 64)
    val payload = text("payload").nullable()
    val status = varchar("status", 16).default("PENDING")
    val attempts = integer("attempts").default(0)
    val error = varchar("last_error", 64).nullable()
    val nextAttemptAt = datetime("next_attempt_at").databaseGenerated()
    val createdAt = datetime("created_at").databaseGenerated()
    val processedAt = datetime("processed_at").nullable()
    override val primaryKey = PrimaryKey(id)
}
