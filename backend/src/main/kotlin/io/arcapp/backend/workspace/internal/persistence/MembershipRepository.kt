package io.arcapp.backend.workspace.internal.persistence

import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.workspace.internal.MemberRoleInput
import io.arcapp.backend.workspace.internal.WorkspaceDeleteInput

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.isNull
import org.jetbrains.exposed.v1.javatime.datetime
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Repository
import java.time.LocalDateTime

private object TeamMembers : Table("workspace_members") {
    val workspaceId = long("workspace_id")
    val userId = long("user_id")
    val role = varchar("role", 16)
    override val primaryKey = PrimaryKey(workspaceId, userId)
}

private object TeamWorkspaces : Table("workspaces") {
    val id = long("id").autoIncrement()
    val name = varchar("name", 120)
    val deletedAt = datetime("deleted_at").nullable()
    override val primaryKey = PrimaryKey(id)
}

private object TeamInvitations : Table("invitations") {
    val id = long("id").autoIncrement()
    val workspaceId = long("workspace_id")
    val email = varchar("email", 320)
    val role = varchar("role", 16)
    val acceptedAt = datetime("accepted_at").nullable()
    val revokedAt = datetime("revoked_at").nullable()
    val expiresAt = datetime("expires_at")
    override val primaryKey = PrimaryKey(id)
}


@Repository
class MembershipRepository {
    private fun lockedAccess(workspaceId: Long, actorId: Long, ownerOnly: Boolean = false) {
        val workspace = TeamWorkspaces.selectAll().where { TeamWorkspaces.id eq workspaceId }.forUpdate().firstOrNull()
            ?: throw ApiError(HttpStatus.NOT_FOUND, "워크스페이스가 없습니다.")
        if (workspace[TeamWorkspaces.deletedAt] != null) throw ApiError(HttpStatus.NOT_FOUND, "워크스페이스가 없습니다.")
        val actor = TeamMembers.selectAll().where { (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq actorId) }.firstOrNull()
        val allowed = if (ownerOnly) setOf("OWNER") else setOf("OWNER", "ADMIN")
        if (actor?.get(TeamMembers.role) !in allowed) throw ApiError(HttpStatus.FORBIDDEN, "워크스페이스 관리 권한이 없습니다.")
    }

    fun deleteWorkspace(actorId: Long, workspaceId: Long, input: WorkspaceDeleteInput) {
        transaction {
            val workspace = TeamWorkspaces.selectAll().where { TeamWorkspaces.id eq workspaceId }.forUpdate().firstOrNull()
                ?: throw ApiError(HttpStatus.NOT_FOUND, "워크스페이스가 없습니다.")
            val owner = TeamMembers.selectAll().where { (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq actorId) }.firstOrNull()
            if (owner?.get(TeamMembers.role) != "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자만 삭제할 수 있습니다.")
            if (workspace[TeamWorkspaces.deletedAt] != null) throw ApiError(HttpStatus.NOT_FOUND, "워크스페이스가 없습니다.")
            if (workspace[TeamWorkspaces.name] != input.confirmation) throw ApiError(HttpStatus.BAD_REQUEST, "워크스페이스 이름을 정확히 입력해 주세요.")
            TeamWorkspaces.update({ TeamWorkspaces.id eq workspaceId }) { it[deletedAt] = LocalDateTime.now(java.time.Clock.systemUTC()) }
        }
    }

    fun invitations(workspaceId: Long): List<Map<String, Any?>> {
        return transaction {
            TeamInvitations.selectAll().where { (TeamInvitations.workspaceId eq workspaceId) and TeamInvitations.acceptedAt.isNull() and TeamInvitations.revokedAt.isNull() }
                .map { row -> mapOf("id" to row[TeamInvitations.id], "email" to row[TeamInvitations.email], "role" to row[TeamInvitations.role], "expiresAt" to row[TeamInvitations.expiresAt].toString()) }
        }
    }

    fun revoke(actorId: Long, workspaceId: Long, id: Long) {
        transaction {
            lockedAccess(workspaceId, actorId)
            TeamInvitations.update({ (TeamInvitations.id eq id) and (TeamInvitations.workspaceId eq workspaceId) and TeamInvitations.acceptedAt.isNull() and TeamInvitations.revokedAt.isNull() }) {
                it[revokedAt] = LocalDateTime.now(java.time.Clock.systemUTC())
            }
        }
    }

    fun changeRole(actorId: Long, workspaceId: Long, userId: Long, input: MemberRoleInput) {
        if (input.role !in setOf("MEMBER", "ADMIN")) throw ApiError(HttpStatus.BAD_REQUEST, "역할이 올바르지 않습니다.")
        transaction {
            lockedAccess(workspaceId, actorId)
            val member = TeamMembers.selectAll().where { (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq userId) }.firstOrNull()
                ?: throw ApiError(HttpStatus.NOT_FOUND, "멤버가 없습니다.")
            if (member[TeamMembers.role] == "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자는 별도 이전 절차가 필요합니다.")
            TeamMembers.update({ (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq userId) }) { it[role] = input.role }
        }
    }

    fun transferOwner(actorId: Long, workspaceId: Long, userId: Long) {
        if (userId == actorId) return
        transaction {
            lockedAccess(workspaceId, actorId, ownerOnly = true)
            val current = TeamMembers.selectAll().where { (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq actorId) }.firstOrNull()
            if (current?.get(TeamMembers.role) != "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자만 이전할 수 있습니다.")
            val next = TeamMembers.selectAll().where { (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq userId) }.firstOrNull()
                ?: throw ApiError(HttpStatus.NOT_FOUND, "멤버가 없습니다.")
            if (next[TeamMembers.role] == "OWNER") return@transaction
            TeamMembers.update({ (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq actorId) }) { it[role] = "ADMIN" }
            TeamMembers.update({ (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq userId) }) { it[role] = "OWNER" }
        }
    }

    fun removeMember(actorId: Long, workspaceId: Long, userId: Long) {
        transaction {
            lockedAccess(workspaceId, actorId)
            val member = TeamMembers.selectAll().where { (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq userId) }.firstOrNull()
                ?: throw ApiError(HttpStatus.NOT_FOUND, "멤버가 없습니다.")
            if (member[TeamMembers.role] == "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자를 제거할 수 없습니다.")
            TeamMembers.deleteWhere { (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq userId) }
        }
    }
}
