package io.arcapp.backend.issue.api

import io.arcapp.backend.issue.internal.persistence.IssueRepository
import org.springframework.stereotype.Service

/** Connection-scoped lookups; caller checks project access or a verified connection. */
@Service
class IssueDevelopmentQueries(private val repository: IssueRepository) {
    fun findNumbers(projectId: Long, numbers: Set<Int>) = repository.findNumbers(projectId, numbers)
    fun contains(projectId: Long, issueId: Long) = repository.find(projectId, issueId) != null
}
