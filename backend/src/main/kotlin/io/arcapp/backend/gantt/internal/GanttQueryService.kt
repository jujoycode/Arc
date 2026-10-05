package io.arcapp.backend.gantt.internal

import io.arcapp.backend.issue.api.IssueTimelineQueries
import io.arcapp.backend.project.api.ProjectTimelineQueries
import org.springframework.stereotype.Service

@Service
class GanttQueryService(private val projects: ProjectTimelineQueries, private val issues: IssueTimelineQueries) {
    fun get(actorId: Long, projectId: Long): Map<String, Any> {
        val projectTimeline = projects.subtree(projectId, actorId)
        val issueTimeline = issues.forProjects(actorId, projectTimeline.ids)
        return mapOf("projects" to projectTimeline.projects, "versions" to projectTimeline.versions, "issues" to issueTimeline.issues, "relations" to issueTimeline.relations)
    }
}
