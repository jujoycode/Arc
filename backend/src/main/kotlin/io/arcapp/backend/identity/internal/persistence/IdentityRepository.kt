package io.arcapp.backend.identity.internal.persistence

import io.arcapp.backend.shared.persistence.dbQuery
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.javatime.datetime
import org.jetbrains.exposed.v1.jdbc.*
import org.springframework.stereotype.Repository
import java.time.Instant
import java.time.Clock
import java.time.LocalDateTime
import java.time.ZoneOffset

private object IdentityUsers : Table("users") {
    val id = long("id").autoIncrement()
    val email = varchar("email", 320)
    val displayName = varchar("display_name", 120)
    val passwordHash = varchar("password_hash", 255).nullable()
    val verifiedAt = datetime("email_verified_at").nullable()
    override val primaryKey = PrimaryKey(id)
}
private object AuthTokens : Table("auth_tokens") {
    val id = long("id").autoIncrement()
    val userId = long("user_id")
    val hash = varchar("token_hash", 64)
    val purpose = varchar("purpose", 16)
    val expiresAt = datetime("expires_at")
    val usedAt = datetime("used_at").nullable()
    override val primaryKey = PrimaryKey(id)
}

private fun ResultRow.credentials(): Map<String, Any?> = mapOf(
    "id" to this[IdentityUsers.id], "email" to this[IdentityUsers.email], "display_name" to this[IdentityUsers.displayName],
    "password_hash" to this[IdentityUsers.passwordHash], "email_verified_at" to this[IdentityUsers.verifiedAt],
)
private fun utcNow() = LocalDateTime.now(Clock.systemUTC())

@Repository
class IdentityRepository {
    fun findByEmail(email: String) = dbQuery { IdentityUsers.selectAll().where { IdentityUsers.email eq email }.firstOrNull()?.credentials() }
    fun create(email: String, name: String, hash: String): Long = dbQuery {
        IdentityUsers.insert { it[IdentityUsers.email] = email; it[displayName] = name; it[passwordHash] = hash }[IdentityUsers.id]
    }
    fun createToken(userId: Long, hash: String, purpose: String, expiresAt: Instant) = dbQuery {
        AuthTokens.insert { it[AuthTokens.userId] = userId; it[AuthTokens.hash] = hash; it[AuthTokens.purpose] = purpose; it[AuthTokens.expiresAt] = expiresAt.atOffset(ZoneOffset.UTC).toLocalDateTime() }
        Unit
    }
    fun verificationUser(hash: String) = dbQuery {
        AuthTokens.select(AuthTokens.userId).where { (AuthTokens.hash eq hash) and (AuthTokens.purpose eq "VERIFY") and AuthTokens.usedAt.isNull() and (AuthTokens.expiresAt greater utcNow()) }
            .forUpdate().firstOrNull()?.let { mapOf("user_id" to it[AuthTokens.userId]) }
    }
    fun verify(userId: Long, hash: String) = dbQuery {
        val now = utcNow()
        IdentityUsers.update({ IdentityUsers.id eq userId }) { it[verifiedAt] = now }
        AuthTokens.update({ AuthTokens.hash eq hash }) { it[usedAt] = now }
        Unit
    }
    fun revokeSession(userId: Long, hash: String) = dbQuery { AuthTokens.update({ (AuthTokens.hash eq hash) and (AuthTokens.userId eq userId) }) { it[usedAt] = utcNow() }; Unit }
    fun user(userId: Long): Map<String, Any?>? = dbQuery {
        IdentityUsers.select(IdentityUsers.id, IdentityUsers.email, IdentityUsers.displayName).where { IdentityUsers.id eq userId }.firstOrNull()
            ?.let { mapOf("id" to it[IdentityUsers.id], "email" to it[IdentityUsers.email], "displayName" to it[IdentityUsers.displayName]) }
    }
    fun sessionUser(hash: String): Long? = dbQuery {
        AuthTokens.join(IdentityUsers, JoinType.INNER, AuthTokens.userId, IdentityUsers.id).select(AuthTokens.userId)
            .where { (AuthTokens.hash eq hash) and (AuthTokens.purpose eq "SESSION") and AuthTokens.usedAt.isNull() and (AuthTokens.expiresAt greater utcNow()) and IdentityUsers.verifiedAt.isNotNull() }
            .firstOrNull()?.get(AuthTokens.userId)
    }
}
