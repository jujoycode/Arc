package io.arcapp.backend.workspace.internal.persistence

import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.workspace.internal.MemberRoleInput
import io.arcapp.backend.workspace.internal.WorkspaceDeleteInput

import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.isNull
import org.jetbrains.exposed.v1.jdbc.selectAll
import io.arcapp.backend.shared.persistence.dbQuery
import org.jetbrains.exposed.v1.jdbc.update
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Repository
import java.time.LocalDateTime

@Repository
class MembershipRepository {
    private fun lockedAccess(workspaceId: Long, actorId: Long, ownerOnly: Boolean = false) {
        val workspace = Workspaces.selectAll().where { Workspaces.id eq workspaceId }.forUpdate().firstOrNull()
            ?: throw ApiError(HttpStatus.NOT_FOUND, "워크스페이스가 없습니다.")
        if (workspace[Workspaces.deletedAt] != null) throw ApiError(HttpStatus.NOT_FOUND, "워크스페이스가 없습니다.")
        val actor = WorkspaceMembers.selectAll().where { (WorkspaceMembers.workspaceId eq workspaceId) and (WorkspaceMembers.userId eq actorId) }.firstOrNull()
        val allowed = if (ownerOnly) setOf("OWNER") else setOf("OWNER", "ADMIN")
        if (actor?.get(WorkspaceMembers.role) !in allowed) throw ApiError(HttpStatus.FORBIDDEN, "워크스페이스 관리 권한이 없습니다.")
    }

    fun deleteWorkspace(actorId: Long, workspaceId: Long, input: WorkspaceDeleteInput) {
        dbQuery {
            val workspace = Workspaces.selectAll().where { Workspaces.id eq workspaceId }.forUpdate().firstOrNull()
                ?: throw ApiError(HttpStatus.NOT_FOUND, "워크스페이스가 없습니다.")
            val owner = WorkspaceMembers.selectAll().where { (WorkspaceMembers.workspaceId eq workspaceId) and (WorkspaceMembers.userId eq actorId) }.firstOrNull()
            if (owner?.get(WorkspaceMembers.role) != "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자만 삭제할 수 있습니다.")
            if (workspace[Workspaces.deletedAt] != null) throw ApiError(HttpStatus.NOT_FOUND, "워크스페이스가 없습니다.")
            if (workspace[Workspaces.name] != input.confirmation) throw ApiError(HttpStatus.BAD_REQUEST, "워크스페이스 이름을 정확히 입력해 주세요.")
            Workspaces.update({ Workspaces.id eq workspaceId }) { it[deletedAt] = LocalDateTime.now(java.time.Clock.systemUTC()) }
        }
    }

    fun invitations(workspaceId: Long): List<Map<String, Any?>> {
        return dbQuery {
            Invitations.selectAll().where { (Invitations.workspaceId eq workspaceId) and Invitations.acceptedAt.isNull() and Invitations.revokedAt.isNull() }
                .map { row -> mapOf("id" to row[Invitations.id], "email" to row[Invitations.email], "role" to row[Invitations.role], "expiresAt" to row[Invitations.expiresAt].toString()) }
        }
    }

    fun revoke(actorId: Long, workspaceId: Long, id: Long) {
        dbQuery {
            lockedAccess(workspaceId, actorId)
            Invitations.update({ (Invitations.id eq id) and (Invitations.workspaceId eq workspaceId) and Invitations.acceptedAt.isNull() and Invitations.revokedAt.isNull() }) {
                it[revokedAt] = LocalDateTime.now(java.time.Clock.systemUTC())
            }
        }
    }

    fun changeRole(actorId: Long, workspaceId: Long, userId: Long, input: MemberRoleInput) {
        if (input.role !in setOf("MEMBER", "ADMIN")) throw ApiError(HttpStatus.BAD_REQUEST, "역할이 올바르지 않습니다.")
        dbQuery {
            lockedAccess(workspaceId, actorId)
            val member = WorkspaceMembers.selectAll().where { (WorkspaceMembers.workspaceId eq workspaceId) and (WorkspaceMembers.userId eq userId) }.firstOrNull()
                ?: throw ApiError(HttpStatus.NOT_FOUND, "멤버가 없습니다.")
            if (member[WorkspaceMembers.role] == "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자는 별도 이전 절차가 필요합니다.")
            WorkspaceMembers.update({ (WorkspaceMembers.workspaceId eq workspaceId) and (WorkspaceMembers.userId eq userId) }) { it[role] = input.role }
        }
    }

    fun transferOwner(actorId: Long, workspaceId: Long, userId: Long) {
        if (userId == actorId) return
        dbQuery {
            lockedAccess(workspaceId, actorId, ownerOnly = true)
            val current = WorkspaceMembers.selectAll().where { (WorkspaceMembers.workspaceId eq workspaceId) and (WorkspaceMembers.userId eq actorId) }.firstOrNull()
            if (current?.get(WorkspaceMembers.role) != "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자만 이전할 수 있습니다.")
            val next = WorkspaceMembers.selectAll().where { (WorkspaceMembers.workspaceId eq workspaceId) and (WorkspaceMembers.userId eq userId) }.firstOrNull()
                ?: throw ApiError(HttpStatus.NOT_FOUND, "멤버가 없습니다.")
            if (next[WorkspaceMembers.role] == "OWNER") return@dbQuery
            WorkspaceMembers.update({ (WorkspaceMembers.workspaceId eq workspaceId) and (WorkspaceMembers.userId eq actorId) }) { it[role] = "ADMIN" }
            WorkspaceMembers.update({ (WorkspaceMembers.workspaceId eq workspaceId) and (WorkspaceMembers.userId eq userId) }) { it[role] = "OWNER" }
        }
    }

    fun removeMember(actorId: Long, workspaceId: Long, userId: Long) {
        dbQuery {
            lockedAccess(workspaceId, actorId)
            val member = WorkspaceMembers.selectAll().where { (WorkspaceMembers.workspaceId eq workspaceId) and (WorkspaceMembers.userId eq userId) }.firstOrNull()
                ?: throw ApiError(HttpStatus.NOT_FOUND, "멤버가 없습니다.")
            if (member[WorkspaceMembers.role] == "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자를 제거할 수 없습니다.")
            WorkspaceMembers.deleteWhere { (WorkspaceMembers.workspaceId eq workspaceId) and (WorkspaceMembers.userId eq userId) }
        }
    }
}
