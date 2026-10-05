package io.arcapp.backend.issue.api

import io.arcapp.backend.issue.internal.persistence.IssueRepository
import io.arcapp.backend.project.api.ProjectAccess
import org.springframework.stereotype.Service

data class IssueTimeline(val issues: List<Map<String, Any?>>, val relations: List<Map<String, Any?>>)

@Service
class IssueTimelineQueries(private val repository: IssueRepository, private val projects: ProjectAccess) {
    fun forProjects(actorId: Long, projectIds: Set<Long>): IssueTimeline {
        projectIds.forEach { projects.get(it, actorId) }
        if (projectIds.isEmpty()) return IssueTimeline(emptyList(), emptyList())
        return IssueTimeline(repository.timeline(projectIds), repository.relations(projectIds))
    }
}
