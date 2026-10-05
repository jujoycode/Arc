package io.arcapp.backend.workspace.internal.persistence

import io.arcapp.backend.shared.persistence.insert
import io.arcapp.backend.shared.persistence.one
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.Instant

@Repository
class WorkspaceRepository(private val jdbc: JdbcTemplate) {
    fun lock(workspaceId: Long) = jdbc.one("SELECT * FROM workspaces WHERE id=? FOR UPDATE", workspaceId)
    fun active(workspaceId: Long) = jdbc.one("SELECT 1 FROM workspaces WHERE id=? AND deleted_at IS NULL", workspaceId) != null
    fun role(workspaceId: Long, userId: Long): String? = jdbc.one("SELECT m.role FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=? AND m.user_id=? AND w.deleted_at IS NULL", workspaceId, userId)?.get("role") as? String
    fun list(userId: Long) = jdbc.queryForList("SELECT w.id,w.name,m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE m.user_id=? AND w.deleted_at IS NULL ORDER BY w.id", userId)
    fun create(name: String): Long = jdbc.insert("INSERT INTO workspaces(name) VALUES(?)", name)
    fun addMember(workspaceId: Long, userId: Long, role: String) { jdbc.update("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,?)", workspaceId, userId, role) }
    fun members(workspaceId: Long) = jdbc.queryForList("SELECT u.id,u.email,u.display_name AS displayName,m.role FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY u.display_name", workspaceId)
    fun containsEmail(workspaceId: Long, email: String) = jdbc.one("SELECT 1 FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND u.email=?", workspaceId, email) != null
    fun invite(workspaceId: Long, email: String, role: String, hash: String, actorId: Long, expiresAt: Instant) {
        jdbc.update("INSERT INTO invitations(workspace_id,email,role,token_hash,invited_by,expires_at) VALUES(?,?,?,?,?,?)", workspaceId, email, role, hash, actorId, java.sql.Timestamp.from(expiresAt))
    }
    fun invitation(hash: String) = jdbc.one("SELECT workspace_id,email,role FROM invitations WHERE token_hash=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(6) FOR UPDATE", hash)
    fun accept(hash: String) { jdbc.update("UPDATE invitations SET accepted_at=UTC_TIMESTAMP(6) WHERE token_hash=?", hash) }
}
