package io.arcapp.backend.savedview.internal

import io.arcapp.backend.project.api.ProjectAccess
import io.arcapp.backend.savedview.internal.persistence.SavedViewRepository
import io.arcapp.backend.shared.api.ApiError
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import tools.jackson.databind.json.JsonMapper

@Service
class SavedViewService(private val repository: SavedViewRepository, private val projects: ProjectAccess) {
    private val json = JsonMapper.builder().build()
    fun list(actorId: Long, projectId: Long): List<Map<String, Any>> { projects.get(projectId, actorId); return repository.list(actorId, projectId) }
    fun create(actorId: Long, projectId: Long, input: SavedViewInput): Map<String, Long> {
        val project = projects.get(projectId, actorId)
        if (input.name.isBlank() || input.name.length > 120 || !jsonObject(input.filters) || !jsonObject(input.options)) throw ApiError(HttpStatus.BAD_REQUEST, "보기 이름 또는 설정이 올바르지 않습니다.")
        return mapOf("id" to repository.create(actorId, project.workspaceId, projectId, input.name.trim(), input.filters, input.options))
    }
    fun delete(actorId: Long, projectId: Long, id: Long) { projects.get(projectId, actorId); repository.delete(actorId, projectId, id) }
    private fun jsonObject(value: String): Boolean = try { json.readTree(value)?.isObject == true } catch (_: Exception) { false }
}
