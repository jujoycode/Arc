package io.arcapp.backend.identity.internal.persistence

import io.arcapp.backend.shared.persistence.insert
import io.arcapp.backend.shared.persistence.one
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.Instant

@Repository
class IdentityRepository(private val jdbc: JdbcTemplate) {
    fun findByEmail(email: String) = jdbc.one("SELECT id,email,display_name,password_hash,email_verified_at FROM users WHERE email=?", email)
    fun create(email: String, name: String, hash: String): Long = jdbc.insert("INSERT INTO users(email,display_name,password_hash) VALUES(?,?,?)", email, name, hash)
    fun createToken(userId: Long, hash: String, purpose: String, expiresAt: Instant) {
        jdbc.update("INSERT INTO auth_tokens(user_id,token_hash,purpose,expires_at) VALUES(?,?,?,?)", userId, hash, purpose, java.sql.Timestamp.from(expiresAt))
    }
    fun verificationUser(hash: String) = jdbc.one("SELECT user_id FROM auth_tokens WHERE token_hash=? AND purpose='VERIFY' AND used_at IS NULL AND expires_at>UTC_TIMESTAMP(6) FOR UPDATE", hash)
    fun verify(userId: Long, hash: String) {
        jdbc.update("UPDATE users SET email_verified_at=UTC_TIMESTAMP(6) WHERE id=?", userId)
        jdbc.update("UPDATE auth_tokens SET used_at=UTC_TIMESTAMP(6) WHERE token_hash=?", hash)
    }
    fun revokeSession(userId: Long, hash: String) { jdbc.update("UPDATE auth_tokens SET used_at=UTC_TIMESTAMP(6) WHERE token_hash=? AND user_id=?", hash, userId) }
    fun user(userId: Long) = jdbc.one("SELECT id,email,display_name AS displayName FROM users WHERE id=?", userId)
    fun sessionUser(hash: String): Long? = jdbc.query(
        "SELECT t.user_id FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.purpose='SESSION' AND t.used_at IS NULL AND t.expires_at>UTC_TIMESTAMP(6) AND u.email_verified_at IS NOT NULL",
        { rs, _ -> rs.getLong(1) }, hash,
    ).firstOrNull()
}
