package io.arcapp.backend.project.api

import io.arcapp.backend.project.internal.persistence.ProjectRepository
import org.springframework.stereotype.Service

data class ProjectTimeline(val ids: Set<Long>, val projects: List<Map<String, Any?>>, val versions: List<Map<String, Any?>>)

@Service
class ProjectTimelineQueries(private val access: ProjectAccess, private val repository: ProjectRepository) {
    fun subtree(projectId: Long, userId: Long): ProjectTimeline {
        val project = access.get(projectId, userId)
        val all = repository.list(project.workspaceId)
        val selected = mutableSetOf(projectId)
        var changed: Boolean
        do {
            changed = false
            for (row in all) {
                val parent = (row["parentProjectId"] as? Number)?.toLong()
                if (parent != null && parent in selected && selected.add((row["id"] as Number).toLong())) changed = true
            }
        } while (changed)
        return ProjectTimeline(selected, all.filter { (it["id"] as Number).toLong() in selected }, repository.versionsFor(selected))
    }
}
