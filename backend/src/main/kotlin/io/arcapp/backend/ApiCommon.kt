package io.arcapp.backend

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.support.GeneratedKeyHolder
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

fun randomToken(): String = ByteArray(32).also { SecureRandom().nextBytes(it) }
    .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }

fun HttpServletRequest.userId(): Long = (getAttribute("arcUserId") as? Long)
    ?: throw ApiError(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.")

class ApiError(val status: HttpStatus, override val message: String) : RuntimeException(message)

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ApiError::class)
    fun known(error: ApiError): ResponseEntity<Map<String, String>> = ResponseEntity.status(error.status).body(mapOf("error" to error.message))

    @ExceptionHandler(org.springframework.dao.DuplicateKeyException::class)
    fun duplicate(): ResponseEntity<Map<String, String>> = ResponseEntity.status(HttpStatus.CONFLICT).body(mapOf("error" to "이미 존재하는 항목입니다."))

    @ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException::class)
    fun invalid(): ResponseEntity<Map<String, String>> = ResponseEntity.badRequest().body(mapOf("error" to "입력값을 확인해 주세요."))
}

fun JdbcTemplate.one(sql: String, vararg args: Any?): Map<String, Any?>? =
    queryForList(sql, *args).firstOrNull()

fun JdbcTemplate.insert(sql: String, vararg args: Any?): Long {
    val holder = GeneratedKeyHolder()
    update({ connection ->
        connection.prepareStatement(sql, java.sql.Statement.RETURN_GENERATED_KEYS).also { statement ->
            args.forEachIndexed { index, value -> statement.setObject(index + 1, value) }
        }
    }, holder)
    return holder.key!!.toLong()
}

fun Map<String, Any?>.long(name: String): Long = (this[name] as Number).toLong()

fun memberRole(jdbc: JdbcTemplate, workspaceId: Long, userId: Long): String =
    jdbc.one("SELECT m.role FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=? AND m.user_id=? AND w.deleted_at IS NULL", workspaceId, userId)
        ?.get("role") as? String ?: throw ApiError(HttpStatus.FORBIDDEN, "워크스페이스 접근 권한이 없습니다.")

fun requireManager(jdbc: JdbcTemplate, workspaceId: Long, userId: Long) {
    if (memberRole(jdbc, workspaceId, userId) !in setOf("OWNER", "ADMIN"))
        throw ApiError(HttpStatus.FORBIDDEN, "관리자 권한이 필요합니다.")
}

fun projectRow(jdbc: JdbcTemplate, projectId: Long, userId: Long): Map<String, Any?> {
    val project = jdbc.one("SELECT * FROM projects WHERE id=?", projectId)
        ?: throw ApiError(HttpStatus.NOT_FOUND, "프로젝트가 없습니다.")
    memberRole(jdbc, project.long("workspace_id"), userId)
    return project
}
