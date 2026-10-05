package io.arcapp.backend.project.internal

import io.arcapp.backend.project.api.ProjectAccess
import io.arcapp.backend.project.internal.persistence.ProjectRepository
import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.shared.persistence.long
import io.arcapp.backend.workspace.api.WorkspaceAccess
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Date

@Service
class ProjectService(private val repository: ProjectRepository, private val access: ProjectAccess, private val workspaces: WorkspaceAccess) {
    fun list(userId: Long, workspaceId: Long): List<Map<String, Any?>> { workspaces.role(workspaceId, userId); return repository.list(workspaceId) }
    fun get(userId: Long, id: Long): Map<String, Any?> { access.get(id, userId); return repository.view(id)!! }
    @Transactional
    fun create(userId: Long, workspaceId: Long, input: ProjectInput): Map<String, Any> {
        workspaces.requireManager(workspaceId, userId)
        repository.lockWorkspace(workspaceId)
        val key = input.key.trim().uppercase()
        if (!key.matches(Regex("^[A-Z][A-Z0-9]{1,9}$")) || input.name.isBlank() || input.name.length > 120) throw ApiError(HttpStatus.BAD_REQUEST, "프로젝트 이름 또는 키가 올바르지 않습니다.")
        checkParent(workspaceId, input.parentProjectId, null)
        val id = repository.create(workspaceId, input.parentProjectId, input.name.trim(), key, input.description)
        return mapOf("id" to id, "workspaceId" to workspaceId, "key" to key, "name" to input.name.trim())
    }
    @Transactional
    fun update(userId: Long, id: Long, input: ProjectEdit) {
        val project = access.get(id, userId)
        workspaces.requireManager(project.workspaceId, userId)
        repository.lockWorkspace(project.workspaceId)
        val locked = repository.lock(id)
        if (input.name.isBlank() || input.name.length > 120) throw ApiError(HttpStatus.BAD_REQUEST, "이름을 확인해 주세요.")
        val key = input.key?.trim()?.uppercase() ?: locked["project_key"] as String
        if (!key.matches(Regex("^[A-Z][A-Z0-9]{1,9}$"))) throw ApiError(HttpStatus.BAD_REQUEST, "프로젝트 키를 확인해 주세요.")
        if (key != locked["project_key"] && locked.long("next_issue_number") > 1) throw ApiError(HttpStatus.CONFLICT, "첫 이슈를 만든 뒤에는 프로젝트 키를 바꿀 수 없습니다.")
        checkParent(project.workspaceId, input.parentProjectId, id)
        repository.update(id, input.name.trim(), key, input.description, input.parentProjectId, input.archived)
    }
    fun versions(userId: Long, id: Long): List<Map<String, Any?>> { access.get(id, userId); return repository.versions(id) }
    @Transactional
    fun createVersion(userId: Long, id: Long, input: VersionInput): Map<String, Long> {
        val project = access.forUpdate(id, userId)
        workspaces.requireManager(project.workspaceId, userId)
        project.requireActive()
        val start: Date?
        val due: Date
        try { start = input.startDate?.let(Date::valueOf); due = Date.valueOf(input.dueDate) }
        catch (_: IllegalArgumentException) { throw ApiError(HttpStatus.BAD_REQUEST, "버전 날짜를 확인해 주세요.") }
        if (input.name.isBlank() || input.name.length > 120 || start != null && start.after(due)) throw ApiError(HttpStatus.BAD_REQUEST, "버전 이름과 날짜를 확인해 주세요.")
        return mapOf("id" to repository.createVersion(id, input.name.trim(), input.description, start, due))
    }
    private fun checkParent(workspaceId: Long, parentId: Long?, projectId: Long?) {
        var current = parentId
        val visited = mutableSetOf<Long>()
        while (current != null) {
            if (current == projectId || !visited.add(current)) throw ApiError(HttpStatus.BAD_REQUEST, "프로젝트 계층에 순환이 생깁니다.")
            val parent = repository.find(current) ?: throw ApiError(HttpStatus.BAD_REQUEST, "부모 프로젝트가 없습니다.")
            if (parent.long("workspace_id") != workspaceId) throw ApiError(HttpStatus.BAD_REQUEST, "다른 워크스페이스의 프로젝트입니다.")
            current = (parent["parent_project_id"] as? Number)?.toLong()
        }
    }
}
