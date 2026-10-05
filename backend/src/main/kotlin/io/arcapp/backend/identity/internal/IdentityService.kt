package io.arcapp.backend.identity.internal

import io.arcapp.backend.identity.internal.persistence.IdentityRepository
import io.arcapp.backend.mail.api.MailSender
import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.shared.persistence.long
import io.arcapp.backend.shared.security.randomToken
import io.arcapp.backend.shared.security.sha256
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit

@Service
class IdentityService(
    private val repository: IdentityRepository,
    private val mail: MailSender,
    @Value("\${arc.public-url}") private val publicUrl: String,
) {
    private val passwords = BCryptPasswordEncoder()

    @Transactional
    fun register(input: RegisterInput): Map<String, String> {
        val email = input.email.trim().lowercase()
        if (!email.matches(Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) || input.displayName.isBlank() || input.displayName.length > 120 || input.password.length < 12 || input.password.toByteArray().size > 72)
            throw ApiError(HttpStatus.BAD_REQUEST, "이메일, 이름, 12자 이상 비밀번호를 확인해 주세요.")
        if (repository.findByEmail(email) != null) throw ApiError(HttpStatus.CONFLICT, "이미 가입된 이메일입니다.")
        val userId = repository.create(email, input.displayName.trim(), requireNotNull(passwords.encode(input.password)))
        val token = randomToken()
        repository.createToken(userId, sha256(token), "VERIFY", Instant.now().plus(1, ChronoUnit.DAYS))
        mail.send(email, "Arc 이메일 확인", "다음 주소에서 이메일을 확인하세요 (24시간 유효):\n${publicUrl.trimEnd('/')}/verify?token=$token")
        return mapOf("message" to "이메일 확인 링크를 보냈습니다.")
    }

    @Transactional
    fun verify(token: String): Map<String, String> {
        val hash = sha256(token)
        val row = repository.verificationUser(hash) ?: throw ApiError(HttpStatus.BAD_REQUEST, "확인 링크가 만료되었거나 유효하지 않습니다.")
        repository.verify(row.long("user_id"), hash)
        return mapOf("message" to "이메일 확인이 완료되었습니다.")
    }

    @Transactional
    fun login(input: LoginInput): Map<String, Any?> {
        if (input.password.toByteArray().size > 72) throw ApiError(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다.")
        val user = repository.findByEmail(input.email.trim().lowercase())
        if (user == null || !passwords.matches(input.password, user["password_hash"] as? String ?: "")) throw ApiError(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다.")
        if (user["email_verified_at"] == null) throw ApiError(HttpStatus.FORBIDDEN, "이메일 확인이 필요합니다.")
        val token = randomToken()
        repository.createToken(user.long("id"), sha256(token), "SESSION", Instant.now().plus(30, ChronoUnit.DAYS))
        return mapOf("token" to token, "user" to mapOf("id" to user.long("id"), "email" to user["email"], "displayName" to user["display_name"]))
    }

    fun logout(userId: Long, token: String) = repository.revokeSession(userId, sha256(token))
    fun me(userId: Long): Map<String, Any?> = repository.user(userId) ?: throw ApiError(HttpStatus.NOT_FOUND, "사용자가 없습니다.")
}
