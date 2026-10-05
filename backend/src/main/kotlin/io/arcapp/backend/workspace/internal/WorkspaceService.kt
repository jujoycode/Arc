package io.arcapp.backend.workspace.internal

import io.arcapp.backend.identity.api.IdentityDirectory
import io.arcapp.backend.mail.api.MailSender
import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.shared.persistence.long
import io.arcapp.backend.shared.security.randomToken
import io.arcapp.backend.shared.security.sha256
import io.arcapp.backend.workspace.api.WorkspaceAccess
import io.arcapp.backend.workspace.internal.persistence.WorkspaceRepository
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit

@Service
class WorkspaceService(
    private val repository: WorkspaceRepository,
    private val access: WorkspaceAccess,
    private val identities: IdentityDirectory,
    private val mail: MailSender,
    @Value("\${arc.public-url}") private val publicUrl: String,
) {
    fun list(userId: Long) = repository.list(userId)
    @Transactional
    fun create(userId: Long, input: WorkspaceInput): Map<String, Any> {
        if (input.name.isBlank() || input.name.length > 120) throw ApiError(HttpStatus.BAD_REQUEST, "워크스페이스 이름을 확인해 주세요.")
        val id = repository.create(input.name.trim())
        repository.addMember(id, userId, "OWNER")
        return mapOf("id" to id, "name" to input.name.trim(), "role" to "OWNER")
    }
    fun members(userId: Long, workspaceId: Long): List<Map<String, Any?>> {
        access.role(workspaceId, userId)
        return repository.members(workspaceId)
    }
    @Transactional
    fun invite(userId: Long, workspaceId: Long, input: InviteInput): Map<String, String> {
        repository.lock(workspaceId)
        access.requireManager(workspaceId, userId)
        val email = input.email.trim().lowercase()
        if (!email.matches(Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) || input.role !in setOf("MEMBER", "ADMIN")) throw ApiError(HttpStatus.BAD_REQUEST, "초대 정보가 올바르지 않습니다.")
        if (repository.containsEmail(workspaceId, email)) throw ApiError(HttpStatus.CONFLICT, "이미 워크스페이스 멤버입니다.")
        val token = randomToken()
        repository.invite(workspaceId, email, input.role, sha256(token), userId, Instant.now().plus(7, ChronoUnit.DAYS))
        mail.send(email, "Arc 팀 초대", "다음 주소에서 초대를 수락하세요 (7일 유효):\n${publicUrl.trimEnd('/')}/invite?token=$token")
        return mapOf("message" to "초대 메일을 보냈습니다.")
    }
    @Transactional
    fun accept(userId: Long, token: String): Map<String, String> {
        val hash = sha256(token)
        val invite = repository.invitation(hash) ?: throw ApiError(HttpStatus.BAD_REQUEST, "초대 링크가 만료되었거나 유효하지 않습니다.")
        if (identities.emailOf(userId) != invite["email"]) throw ApiError(HttpStatus.FORBIDDEN, "초대된 이메일로 로그인해 주세요.")
        val workspaceId = invite.long("workspace_id")
        repository.lock(workspaceId)
        if (!repository.active(workspaceId)) throw ApiError(HttpStatus.BAD_REQUEST, "워크스페이스가 없습니다.")
        if (repository.role(workspaceId, userId) != null) throw ApiError(HttpStatus.CONFLICT, "이미 워크스페이스 멤버입니다.")
        repository.addMember(workspaceId, userId, invite["role"] as String)
        repository.accept(hash)
        return mapOf("message" to "초대를 수락했습니다.")
    }
}
