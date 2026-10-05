package io.arcapp.backend.workspace.internal.persistence

import io.arcapp.backend.shared.persistence.dbQuery
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.springframework.stereotype.Repository
import java.time.Instant
import java.time.Clock
import java.time.LocalDateTime
import java.time.ZoneOffset

@Repository
class WorkspaceRepository {
    fun lock(workspaceId: Long): Map<String, Any?>? = dbQuery {
        Workspaces.selectAll().where { Workspaces.id eq workspaceId }.forUpdate().firstOrNull()?.let { mapOf("id" to it[Workspaces.id], "name" to it[Workspaces.name], "deleted_at" to it[Workspaces.deletedAt]) }
    }
    fun active(workspaceId: Long) = dbQuery { Workspaces.select(Workspaces.id).where { (Workspaces.id eq workspaceId) and Workspaces.deletedAt.isNull() }.any() }
    fun role(workspaceId: Long, userId: Long): String? = dbQuery {
        WorkspaceMembers.join(Workspaces, JoinType.INNER, WorkspaceMembers.workspaceId, Workspaces.id).select(WorkspaceMembers.role)
            .where { (WorkspaceMembers.workspaceId eq workspaceId) and (WorkspaceMembers.userId eq userId) and Workspaces.deletedAt.isNull() }.firstOrNull()?.get(WorkspaceMembers.role)
    }
    fun list(userId: Long): List<Map<String, Any?>> = dbQuery {
        Workspaces.join(WorkspaceMembers, JoinType.INNER, Workspaces.id, WorkspaceMembers.workspaceId).select(Workspaces.id, Workspaces.name, WorkspaceMembers.role)
            .where { (WorkspaceMembers.userId eq userId) and Workspaces.deletedAt.isNull() }.orderBy(Workspaces.id)
            .map { mapOf("id" to it[Workspaces.id], "name" to it[Workspaces.name], "role" to it[WorkspaceMembers.role]) }
    }
    fun create(name: String): Long = dbQuery { Workspaces.insert { it[Workspaces.name] = name }[Workspaces.id] }
    fun addMember(workspaceId: Long, userId: Long, role: String) = dbQuery { WorkspaceMembers.insert { it[WorkspaceMembers.workspaceId] = workspaceId; it[WorkspaceMembers.userId] = userId; it[WorkspaceMembers.role] = role }; Unit }
    fun members(workspaceId: Long): List<Map<String, Any?>> = dbQuery {
        WorkspaceMembers.join(MemberUsers, JoinType.INNER, WorkspaceMembers.userId, MemberUsers.id).select(MemberUsers.id, MemberUsers.email, MemberUsers.displayName, WorkspaceMembers.role)
            .where { WorkspaceMembers.workspaceId eq workspaceId }.orderBy(MemberUsers.displayName)
            .map { mapOf("id" to it[MemberUsers.id], "email" to it[MemberUsers.email], "displayName" to it[MemberUsers.displayName], "role" to it[WorkspaceMembers.role]) }
    }
    fun containsEmail(workspaceId: Long, email: String) = dbQuery {
        WorkspaceMembers.join(MemberUsers, JoinType.INNER, WorkspaceMembers.userId, MemberUsers.id).select(WorkspaceMembers.userId)
            .where { (WorkspaceMembers.workspaceId eq workspaceId) and (MemberUsers.email eq email) }.any()
    }
    fun invite(workspaceId: Long, email: String, role: String, hash: String, actorId: Long, expiresAt: Instant) = dbQuery {
        Invitations.insert { it[Invitations.workspaceId] = workspaceId; it[Invitations.email] = email; it[Invitations.role] = role; it[Invitations.hash] = hash; it[invitedBy] = actorId; it[Invitations.expiresAt] = expiresAt.atOffset(ZoneOffset.UTC).toLocalDateTime() }
        Unit
    }
    fun invitation(hash: String): Map<String, Any?>? = dbQuery {
        Invitations.select(Invitations.workspaceId, Invitations.email, Invitations.role).where { (Invitations.hash eq hash) and Invitations.acceptedAt.isNull() and Invitations.revokedAt.isNull() and (Invitations.expiresAt greater LocalDateTime.now(Clock.systemUTC())) }
            .forUpdate().firstOrNull()?.let { mapOf("workspace_id" to it[Invitations.workspaceId], "email" to it[Invitations.email], "role" to it[Invitations.role]) }
    }
    fun accept(hash: String) = dbQuery { Invitations.update({ Invitations.hash eq hash }) { it[acceptedAt] = LocalDateTime.now(Clock.systemUTC()) }; Unit }
}
