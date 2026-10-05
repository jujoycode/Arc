package io.arcapp.backend.project.internal.persistence

import io.arcapp.backend.shared.persistence.insert
import io.arcapp.backend.shared.persistence.one
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.Date

@Repository
class ProjectRepository(private val jdbc: JdbcTemplate) {
    private val projection = "id,workspace_id AS workspaceId,parent_project_id AS parentProjectId,name,project_key AS `key`,next_issue_number AS nextIssueNumber,description,archived_at AS archivedAt"
    fun find(id: Long) = jdbc.one("SELECT * FROM projects WHERE id=?", id)
    fun view(id: Long) = jdbc.one("SELECT $projection FROM projects WHERE id=?", id)
    fun list(workspaceId: Long) = jdbc.queryForList("SELECT $projection FROM projects WHERE workspace_id=? ORDER BY name,id", workspaceId)
    fun create(workspaceId: Long, parentId: Long?, name: String, key: String, description: String?): Long = jdbc.insert("INSERT INTO projects(workspace_id,parent_project_id,name,project_key,description) VALUES(?,?,?,?,?)", workspaceId, parentId, name, key, description)
    fun lockWorkspace(workspaceId: Long) { jdbc.one("SELECT id FROM workspaces WHERE id=? FOR UPDATE", workspaceId) }
    fun lock(id: Long) = jdbc.one("SELECT * FROM projects WHERE id=? FOR UPDATE", id)!!
    fun allocateIssueNumber(id: Long): Int {
        val number = (lock(id)["next_issue_number"] as Number).toInt()
        jdbc.update("UPDATE projects SET next_issue_number=next_issue_number+1 WHERE id=?", id)
        return number
    }
    fun containsVersion(projectId: Long, versionId: Long): Boolean = jdbc.one("SELECT id FROM versions WHERE id=? AND project_id=?", versionId, projectId) != null
    fun update(id: Long, name: String, key: String, description: String?, parentId: Long?, archived: Boolean) { jdbc.update("UPDATE projects SET name=?,project_key=?,description=?,parent_project_id=?,archived_at=IF(?,UTC_TIMESTAMP(6),NULL) WHERE id=?", name, key, description, parentId, archived, id) }
    fun versions(id: Long) = jdbc.queryForList("SELECT id,project_id AS projectId,name,description,start_date AS startDate,due_date AS dueDate,status FROM versions WHERE project_id=? ORDER BY due_date,id", id)
    fun createVersion(projectId: Long, name: String, description: String?, startDate: Date?, dueDate: Date): Long = jdbc.insert("INSERT INTO versions(project_id,name,description,start_date,due_date) VALUES(?,?,?,?,?)", projectId, name, description, startDate, dueDate)
    fun versionsFor(ids: Set<Long>): List<Map<String, Any?>> {
        val marks = List(ids.size) { "?" }.joinToString(",")
        return jdbc.queryForList("SELECT id,project_id AS projectId,name,description,start_date AS startDate,due_date AS dueDate,status FROM versions WHERE project_id IN ($marks) ORDER BY due_date,id", *ids.toTypedArray())
    }
}
