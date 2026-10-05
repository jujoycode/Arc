package io.arcapp.backend

import jakarta.servlet.http.HttpServletRequest
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.time.Instant
import java.time.temporal.ChronoUnit

data class RegisterInput(val email: String, val displayName: String, val password: String)
data class LoginInput(val email: String, val password: String)
data class WorkspaceInput(val name: String)
data class InviteInput(val email: String, val role: String = "MEMBER")

@RestController
@RequestMapping("/api/auth")
class AuthApi(
    private val jdbc: JdbcTemplate,
    private val mail: JavaMailSender,
    @Value("\${arc.public-url}") private val publicUrl: String,
    @Value("\${arc.mail-from}") private val fromAddress: String,
) {
    private val passwords = BCryptPasswordEncoder()

    @PostMapping("/register")
    @Transactional
    fun register(@RequestBody input: RegisterInput): Map<String, String> {
        val email = input.email.trim().lowercase()
        if (!email.matches(Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) || input.displayName.isBlank() || input.displayName.length > 120 || input.password.length < 12)
            throw ApiError(HttpStatus.BAD_REQUEST, "이메일, 이름, 12자 이상 비밀번호를 확인해 주세요.")
        if (jdbc.one("SELECT id FROM users WHERE email=?", email) != null)
            throw ApiError(HttpStatus.CONFLICT, "이미 가입된 이메일입니다.")
        val userId = jdbc.insert("INSERT INTO users(email,display_name,password_hash) VALUES(?,?,?)", email, input.displayName.trim(), passwords.encode(input.password))
        val token = randomToken()
        jdbc.update("INSERT INTO auth_tokens(user_id,token_hash,purpose,expires_at) VALUES(?,?,'VERIFY',?)", userId, sha256(token), java.sql.Timestamp.from(Instant.now().plus(1, ChronoUnit.DAYS)))
        send(email, "Arc 이메일 확인", "다음 주소에서 이메일을 확인하세요 (24시간 유효):\n${publicUrl.trimEnd('/')}/verify?token=$token")
        return mapOf("message" to "이메일 확인 링크를 보냈습니다.")
    }

    @PostMapping("/verify")
    @Transactional
    fun verify(@RequestParam token: String): Map<String, String> {
        val row = jdbc.one("SELECT user_id FROM auth_tokens WHERE token_hash=? AND purpose='VERIFY' AND used_at IS NULL AND expires_at>UTC_TIMESTAMP(6) FOR UPDATE", sha256(token))
            ?: throw ApiError(HttpStatus.BAD_REQUEST, "확인 링크가 만료되었거나 유효하지 않습니다.")
        jdbc.update("UPDATE users SET email_verified_at=UTC_TIMESTAMP(6) WHERE id=?", row.long("user_id"))
        jdbc.update("UPDATE auth_tokens SET used_at=UTC_TIMESTAMP(6) WHERE token_hash=?", sha256(token))
        return mapOf("message" to "이메일 확인이 완료되었습니다.")
    }

    @PostMapping("/login")
    @Transactional
    fun login(@RequestBody input: LoginInput): Map<String, Any?> {
        val user = jdbc.one("SELECT id,email,display_name,password_hash,email_verified_at FROM users WHERE email=?", input.email.trim().lowercase())
        if (user == null || !passwords.matches(input.password, user["password_hash"] as? String ?: ""))
            throw ApiError(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다.")
        if (user["email_verified_at"] == null) throw ApiError(HttpStatus.FORBIDDEN, "이메일 확인이 필요합니다.")
        val token = randomToken()
        jdbc.update("INSERT INTO auth_tokens(user_id,token_hash,purpose,expires_at) VALUES(?,?,'SESSION',?)", user.long("id"), sha256(token), java.sql.Timestamp.from(Instant.now().plus(30, ChronoUnit.DAYS)))
        return mapOf("token" to token, "user" to mapOf("id" to user.long("id"), "email" to user["email"], "displayName" to user["display_name"]))
    }

    @PostMapping("/logout")
    fun logout(request: HttpServletRequest) {
        val token = request.getHeader("Authorization").removePrefix("Bearer ")
        jdbc.update("UPDATE auth_tokens SET used_at=UTC_TIMESTAMP(6) WHERE token_hash=? AND user_id=?", sha256(token), request.userId())
    }

    @GetMapping("/me")
    fun me(request: HttpServletRequest): Map<String, Any?> = jdbc.one("SELECT id,email,display_name AS displayName FROM users WHERE id=?", request.userId())!!

    @GetMapping("/workspaces")
    fun workspaces(request: HttpServletRequest): List<Map<String, Any?>> = jdbc.queryForList(
        "SELECT w.id,w.name,m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE m.user_id=? AND w.deleted_at IS NULL ORDER BY w.id", request.userId()
    )

    @PostMapping("/workspaces")
    @Transactional
    fun createWorkspace(request: HttpServletRequest, @RequestBody input: WorkspaceInput): Map<String, Any> {
        if (input.name.isBlank() || input.name.length > 120) throw ApiError(HttpStatus.BAD_REQUEST, "워크스페이스 이름을 확인해 주세요.")
        val id = jdbc.insert("INSERT INTO workspaces(name) VALUES(?)", input.name.trim())
        jdbc.update("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'OWNER')", id, request.userId())
        return mapOf("id" to id, "name" to input.name.trim(), "role" to "OWNER")
    }

    @GetMapping("/workspaces/{id}/members")
    fun members(request: HttpServletRequest, @PathVariable id: Long): List<Map<String, Any?>> {
        memberRole(jdbc, id, request.userId())
        return jdbc.queryForList("SELECT u.id,u.email,u.display_name AS displayName,m.role FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY u.display_name", id)
    }

    @PostMapping("/workspaces/{id}/invitations")
    @Transactional
    fun invite(request: HttpServletRequest, @PathVariable id: Long, @RequestBody input: InviteInput): Map<String, String> {
        requireManager(jdbc, id, request.userId())
        val email = input.email.trim().lowercase()
        if (!email.matches(Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) || input.role !in setOf("MEMBER", "ADMIN"))
            throw ApiError(HttpStatus.BAD_REQUEST, "초대 정보가 올바르지 않습니다.")
        if (jdbc.one("SELECT 1 FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND u.email=?", id, email) != null)
            throw ApiError(HttpStatus.CONFLICT, "이미 워크스페이스 멤버입니다.")
        val token = randomToken()
        jdbc.update("INSERT INTO invitations(workspace_id,email,role,token_hash,invited_by,expires_at) VALUES(?,?,?,?,?,?)", id, email, input.role, sha256(token), request.userId(), java.sql.Timestamp.from(Instant.now().plus(7, ChronoUnit.DAYS)))
        send(email, "Arc 팀 초대", "다음 주소에서 초대를 수락하세요 (7일 유효):\n${publicUrl.trimEnd('/')}/invite?token=$token")
        return mapOf("message" to "초대 메일을 보냈습니다.")
    }

    @PostMapping("/invitations/accept")
    @Transactional
    fun accept(request: HttpServletRequest, @RequestParam token: String): Map<String, String> {
        val invite = jdbc.one("SELECT workspace_id,email,role FROM invitations WHERE token_hash=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(6) FOR UPDATE", sha256(token))
            ?: throw ApiError(HttpStatus.BAD_REQUEST, "초대 링크가 만료되었거나 유효하지 않습니다.")
        val user = jdbc.one("SELECT email FROM users WHERE id=?", request.userId())!!
        if (user["email"] != invite["email"]) throw ApiError(HttpStatus.FORBIDDEN, "초대된 이메일로 로그인해 주세요.")
        jdbc.update("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,?)", invite.long("workspace_id"), request.userId(), invite["role"])
        jdbc.update("UPDATE invitations SET accepted_at=UTC_TIMESTAMP(6) WHERE token_hash=?", sha256(token))
        return mapOf("message" to "초대를 수락했습니다.")
    }

    private fun send(to: String, subject: String, body: String) {
        val message = SimpleMailMessage()
        message.setFrom(fromAddress)
        message.setTo(to)
        message.subject = subject
        message.text = body
        mail.send(message)
    }
}
