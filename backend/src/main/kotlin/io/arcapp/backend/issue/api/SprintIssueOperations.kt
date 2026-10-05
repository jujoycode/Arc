package io.arcapp.backend.issue.api

import io.arcapp.backend.issue.internal.persistence.IssueRepository
import io.arcapp.backend.issue.internal.persistence.SprintIssueRepository
import io.arcapp.backend.shared.api.ApiError
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

/** SprintService owns permission checks and the encompassing transaction. */
@Service
class SprintIssueOperations(private val repository: SprintIssueRepository, private val issues: IssueRepository) {
    fun totals(projectId: Long, sprintId: Long) = repository.totals(projectId, sprintId)
    fun close(actorId: Long, projectId: Long, sprintId: Long, nextSprintId: Long?): Map<String, Any?> {
        repository.recordResult(projectId, sprintId)
        val summary = repository.summary(projectId, sprintId)
        repository.moveAfterClose(actorId, projectId, sprintId, nextSprintId)
        return summary
    }
    fun history(sprintId: Long) = repository.history(sprintId)
    fun assign(actorId: Long, projectId: Long, issueId: Long, sprintId: Long?) {
        if (repository.assign(projectId, issueId, sprintId) == 0) throw ApiError(HttpStatus.NOT_FOUND, "이슈가 없습니다.")
        issues.activity(issueId, actorId, "SPRINT_CHANGED")
    }
    fun reorder(projectId: Long, issueIds: List<Long>) {
        if (issueIds.distinct().size != issueIds.size) throw ApiError(HttpStatus.BAD_REQUEST, "중복 이슈가 있습니다.")
        issueIds.forEachIndexed { index, id ->
            if (repository.reorder(projectId, id, index) == 0) throw ApiError(HttpStatus.BAD_REQUEST, "백로그 이슈만 정렬할 수 있습니다.")
        }
    }
}
