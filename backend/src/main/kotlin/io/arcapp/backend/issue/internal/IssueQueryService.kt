package io.arcapp.backend.issue.internal

import io.arcapp.backend.issue.internal.persistence.IssueRepository
import io.arcapp.backend.project.api.ProjectAccess
import io.arcapp.backend.shared.api.ApiError
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

@Service
class IssueQueryService(private val repository: IssueRepository, private val projects: ProjectAccess) {
    fun list(actorId: Long, projectId: Long, criteria: IssueSearch): Map<String, Any> {
        projects.get(projectId, actorId)
        if (criteria.sprintState != null && criteria.sprintState !in setOf("BACKLOG", "ASSIGNED")) throw ApiError(HttpStatus.BAD_REQUEST, "스프린트 필터가 올바르지 않습니다.")
        if (!repository.supportsSort(criteria.sort)) throw ApiError(HttpStatus.BAD_REQUEST, "정렬 기준이 올바르지 않습니다.")
        if (criteria.direction !in setOf("asc", "desc")) throw ApiError(HttpStatus.BAD_REQUEST, "정렬 방향이 올바르지 않습니다.")
        return repository.list(projectId, criteria)
    }
    fun get(actorId: Long, projectId: Long, id: Long): Map<String, Any?> {
        projects.get(projectId, actorId)
        return repository.detail(projectId, id) ?: throw ApiError(HttpStatus.NOT_FOUND, "이슈가 없습니다.")
    }
    fun relations(actorId: Long, projectId: Long): List<Map<String, Any?>> {
        projects.get(projectId, actorId)
        return repository.relations(setOf(projectId))
    }
    fun comments(actorId: Long, projectId: Long, id: Long): List<Map<String, Any?>> { get(actorId, projectId, id); return repository.comments(id) }
    fun activities(actorId: Long, projectId: Long, id: Long): List<Map<String, Any?>> { get(actorId, projectId, id); return repository.activities(id) }
}
