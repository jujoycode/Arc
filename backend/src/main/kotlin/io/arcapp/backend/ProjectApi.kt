package io.arcapp.backend

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*

data class ProjectInput(val name: String, val key: String, val description: String? = null, val parentProjectId: Long? = null)
data class ProjectEdit(val name: String, val description: String? = null, val parentProjectId: Long? = null, val archived: Boolean = false)
data class VersionInput(val name: String, val description: String? = null, val startDate: String? = null, val dueDate: String)

@RestController
class ProjectApi(private val jdbc: JdbcTemplate) {
    @GetMapping("/api/workspaces/{workspaceId}/projects")
    fun list(request: HttpServletRequest, @PathVariable workspaceId: Long): List<Map<String, Any?>> {
        memberRole(jdbc, workspaceId, request.userId())
        return jdbc.queryForList("SELECT id,workspace_id AS workspaceId,parent_project_id AS parentProjectId,name,project_key AS `key`,description,archived_at AS archivedAt FROM projects WHERE workspace_id=? ORDER BY name", workspaceId)
    }

    @PostMapping("/api/workspaces/{workspaceId}/projects")
    @Transactional
    fun create(request: HttpServletRequest, @PathVariable workspaceId: Long, @RequestBody input: ProjectInput): Map<String, Any> {
        requireManager(jdbc, workspaceId, request.userId())
        val key = input.key.trim().uppercase()
        if (!key.matches(Regex("^[A-Z][A-Z0-9]{1,9}$")) || input.name.isBlank() || input.name.length > 120)
            throw ApiError(HttpStatus.BAD_REQUEST, "프로젝트 이름 또는 키가 올바르지 않습니다.")
        checkParent(workspaceId, input.parentProjectId, null)
        val id = jdbc.insert("INSERT INTO projects(workspace_id,parent_project_id,name,project_key,description) VALUES(?,?,?,?,?)", workspaceId, input.parentProjectId, input.name.trim(), key, input.description)
        return mapOf("id" to id, "workspaceId" to workspaceId, "key" to key, "name" to input.name.trim())
    }

    @GetMapping("/api/projects/{id}")
    fun get(request: HttpServletRequest, @PathVariable id: Long): Map<String, Any?> {
        projectRow(jdbc, id, request.userId())
        return jdbc.one("SELECT id,workspace_id AS workspaceId,parent_project_id AS parentProjectId,name,project_key AS `key`,description,archived_at AS archivedAt FROM projects WHERE id=?", id)!!
    }

    @PutMapping("/api/projects/{id}")
    @Transactional
    fun update(request: HttpServletRequest, @PathVariable id: Long, @RequestBody input: ProjectEdit) {
        val project = projectRow(jdbc, id, request.userId())
        requireManager(jdbc, project.long("workspace_id"), request.userId())
        if (input.name.isBlank() || input.name.length > 120) throw ApiError(HttpStatus.BAD_REQUEST, "이름을 확인해 주세요.")
        checkParent(project.long("workspace_id"), input.parentProjectId, id)
        jdbc.update("UPDATE projects SET name=?,description=?,parent_project_id=?,archived_at=IF(?,UTC_TIMESTAMP(6),NULL) WHERE id=?", input.name.trim(), input.description, input.parentProjectId, input.archived, id)
    }

    @GetMapping("/api/projects/{id}/versions")
    fun versions(request: HttpServletRequest, @PathVariable id: Long): List<Map<String, Any?>> {
        projectRow(jdbc, id, request.userId())
        return jdbc.queryForList("SELECT id,name,description,start_date AS startDate,due_date AS dueDate,status FROM versions WHERE project_id=? ORDER BY due_date", id)
    }

    @PostMapping("/api/projects/{id}/versions")
    fun createVersion(request: HttpServletRequest, @PathVariable id: Long, @RequestBody input: VersionInput): Map<String, Any> {
        val project = projectRow(jdbc, id, request.userId())
        requireManager(jdbc, project.long("workspace_id"), request.userId())
        if (project["archived_at"] != null) throw ApiError(HttpStatus.CONFLICT, "보관된 프로젝트입니다.")
        if (input.name.isBlank() || input.startDate != null && input.startDate > input.dueDate) throw ApiError(HttpStatus.BAD_REQUEST, "버전 날짜를 확인해 주세요.")
        val idVersion = jdbc.insert("INSERT INTO versions(project_id,name,description,start_date,due_date) VALUES(?,?,?,?,?)", id, input.name.trim(), input.description, input.startDate?.let(java.sql.Date::valueOf), java.sql.Date.valueOf(input.dueDate))
        return mapOf("id" to idVersion)
    }

    private fun checkParent(workspaceId: Long, parentId: Long?, projectId: Long?) {
        if (parentId == null) return
        var current: Long? = parentId
        val visited = mutableSetOf<Long>()
        while (current != null) {
            if (current == projectId || !visited.add(current)) throw ApiError(HttpStatus.BAD_REQUEST, "프로젝트 계층에 순환이 생깁니다.")
            val parent = jdbc.one("SELECT workspace_id,parent_project_id FROM projects WHERE id=?", current)
                ?: throw ApiError(HttpStatus.BAD_REQUEST, "부모 프로젝트가 없습니다.")
            if (parent.long("workspace_id") != workspaceId) throw ApiError(HttpStatus.BAD_REQUEST, "다른 워크스페이스의 프로젝트입니다.")
            current = (parent["parent_project_id"] as? Number)?.toLong()
        }
    }
}
