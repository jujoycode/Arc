package io.arcapp.backend.workspace.internal.persistence

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.javatime.datetime

internal object Workspaces : Table("workspaces") {
    val id = long("id").autoIncrement()
    val name = varchar("name", 120)
    val deletedAt = datetime("deleted_at").nullable()
    override val primaryKey = PrimaryKey(id)
}
internal object WorkspaceMembers : Table("workspace_members") {
    val workspaceId = long("workspace_id")
    val userId = long("user_id")
    val role = varchar("role", 16)
    override val primaryKey = PrimaryKey(workspaceId, userId)
}
internal object Invitations : Table("invitations") {
    val id = long("id").autoIncrement()
    val workspaceId = long("workspace_id")
    val email = varchar("email", 320)
    val role = varchar("role", 16)
    val hash = varchar("token_hash", 64)
    val invitedBy = long("invited_by")
    val expiresAt = datetime("expires_at")
    val acceptedAt = datetime("accepted_at").nullable()
    val revokedAt = datetime("revoked_at").nullable()
    override val primaryKey = PrimaryKey(id)
}
/** Read projection owned by workspace; user writes stay in identity. */
internal object MemberUsers : Table("users") {
    val id = long("id")
    val email = varchar("email", 320)
    val displayName = varchar("display_name", 120)
}
