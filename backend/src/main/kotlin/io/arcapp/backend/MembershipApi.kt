package io.arcapp.backend

import jakarta.servlet.http.HttpServletRequest
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
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.*
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

data class MemberRoleInput(val role: String)
data class WorkspaceDeleteInput(val confirmation: String)

@RestController
class MembershipApi(private val jdbc: JdbcTemplate) {
    @DeleteMapping("/api/auth/workspaces/{workspaceId}")
    fun deleteWorkspace(request: HttpServletRequest, @PathVariable workspaceId: Long, @RequestBody input: WorkspaceDeleteInput) {
        if (memberRole(jdbc, workspaceId, request.userId()) != "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자만 삭제할 수 있습니다.")
        transaction {
            val workspace = TeamWorkspaces.selectAll().where { TeamWorkspaces.id eq workspaceId }.forUpdate().firstOrNull()
                ?: throw ApiError(HttpStatus.NOT_FOUND, "워크스페이스가 없습니다.")
            if (workspace[TeamWorkspaces.deletedAt] != null) throw ApiError(HttpStatus.NOT_FOUND, "워크스페이스가 없습니다.")
            if (workspace[TeamWorkspaces.name] != input.confirmation) throw ApiError(HttpStatus.BAD_REQUEST, "워크스페이스 이름을 정확히 입력해 주세요.")
            TeamWorkspaces.update({ TeamWorkspaces.id eq workspaceId }) { it[deletedAt] = LocalDateTime.now(java.time.Clock.systemUTC()) }
        }
    }

    @GetMapping("/api/auth/workspaces/{workspaceId}/invitations")
    fun invitations(request: HttpServletRequest, @PathVariable workspaceId: Long): List<Map<String, Any?>> {
        requireManager(jdbc, workspaceId, request.userId())
        return transaction {
            TeamInvitations.selectAll().where { (TeamInvitations.workspaceId eq workspaceId) and TeamInvitations.acceptedAt.isNull() and TeamInvitations.revokedAt.isNull() }
                .map { row -> mapOf("id" to row[TeamInvitations.id], "email" to row[TeamInvitations.email], "role" to row[TeamInvitations.role], "expiresAt" to row[TeamInvitations.expiresAt].toString()) }
        }
    }

    @DeleteMapping("/api/auth/workspaces/{workspaceId}/invitations/{id}")
    fun revoke(request: HttpServletRequest, @PathVariable workspaceId: Long, @PathVariable id: Long) {
        requireManager(jdbc, workspaceId, request.userId())
        transaction {
            TeamInvitations.update({ (TeamInvitations.id eq id) and (TeamInvitations.workspaceId eq workspaceId) and TeamInvitations.acceptedAt.isNull() and TeamInvitations.revokedAt.isNull() }) {
                it[revokedAt] = LocalDateTime.now(java.time.Clock.systemUTC())
            }
        }
    }

    @PatchMapping("/api/auth/workspaces/{workspaceId}/members/{userId}/role")
    fun changeRole(request: HttpServletRequest, @PathVariable workspaceId: Long, @PathVariable userId: Long, @RequestBody input: MemberRoleInput) {
        requireManager(jdbc, workspaceId, request.userId())
        if (input.role !in setOf("MEMBER", "ADMIN")) throw ApiError(HttpStatus.BAD_REQUEST, "역할이 올바르지 않습니다.")
        transaction {
            val member = TeamMembers.selectAll().where { (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq userId) }.firstOrNull()
                ?: throw ApiError(HttpStatus.NOT_FOUND, "멤버가 없습니다.")
            if (member[TeamMembers.role] == "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자는 별도 이전 절차가 필요합니다.")
            TeamMembers.update({ (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq userId) }) { it[role] = input.role }
        }
    }

    @PostMapping("/api/auth/workspaces/{workspaceId}/owner/{userId}")
    fun transferOwner(request: HttpServletRequest, @PathVariable workspaceId: Long, @PathVariable userId: Long) {
        if (memberRole(jdbc, workspaceId, request.userId()) != "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자만 이전할 수 있습니다.")
        if (userId == request.userId()) return
        transaction {
            TeamWorkspaces.selectAll().where { TeamWorkspaces.id eq workspaceId }.forUpdate().firstOrNull()
                ?: throw ApiError(HttpStatus.NOT_FOUND, "워크스페이스가 없습니다.")
            val current = TeamMembers.selectAll().where { (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq request.userId()) }.firstOrNull()
            if (current?.get(TeamMembers.role) != "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자만 이전할 수 있습니다.")
            val next = TeamMembers.selectAll().where { (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq userId) }.firstOrNull()
                ?: throw ApiError(HttpStatus.NOT_FOUND, "멤버가 없습니다.")
            if (next[TeamMembers.role] == "OWNER") return@transaction
            TeamMembers.update({ (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq request.userId()) }) { it[role] = "ADMIN" }
            TeamMembers.update({ (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq userId) }) { it[role] = "OWNER" }
        }
    }

    @DeleteMapping("/api/auth/workspaces/{workspaceId}/members/{userId}")
    fun removeMember(request: HttpServletRequest, @PathVariable workspaceId: Long, @PathVariable userId: Long) {
        requireManager(jdbc, workspaceId, request.userId())
        transaction {
            val member = TeamMembers.selectAll().where { (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq userId) }.firstOrNull()
                ?: throw ApiError(HttpStatus.NOT_FOUND, "멤버가 없습니다.")
            if (member[TeamMembers.role] == "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자를 제거할 수 없습니다.")
            TeamMembers.deleteWhere { (TeamMembers.workspaceId eq workspaceId) and (TeamMembers.userId eq userId) }
        }
    }
}
