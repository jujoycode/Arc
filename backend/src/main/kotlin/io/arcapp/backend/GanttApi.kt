package io.arcapp.backend

import jakarta.servlet.http.HttpServletRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController

@RestController
class GanttApi(private val jdbc: JdbcTemplate) {
    @GetMapping("/api/projects/{projectId}/gantt")
    fun gantt(request: HttpServletRequest, @PathVariable projectId: Long): Map<String, Any> {
        val root = projectRow(jdbc, projectId, request.userId())
        val workspaceId = root.long("workspace_id")
        val allProjects = jdbc.queryForList(
            "SELECT id,workspace_id AS workspaceId,parent_project_id AS parentProjectId,name,project_key AS `key`,description,archived_at AS archivedAt FROM projects WHERE workspace_id=? ORDER BY name,id",
            workspaceId,
        )
        val selected = mutableSetOf(projectId)
        var changed: Boolean
        do {
            changed = false
            for (project in allProjects) {
                val parentId = (project["parentProjectId"] as? Number)?.toLong()
                if (parentId != null && parentId in selected && selected.add((project["id"] as Number).toLong())) changed = true
            }
        } while (changed)
        val projects = allProjects.filter { (it["id"] as Number).toLong() in selected }
        val marks = List(selected.size) { "?" }.joinToString(",")
        val ids = selected.toTypedArray()
        val versions = jdbc.queryForList(
            "SELECT id,project_id AS projectId,name,description,start_date AS startDate,due_date AS dueDate,status FROM versions WHERE project_id IN ($marks) ORDER BY due_date,id",
            *ids,
        )
        val issues = jdbc.queryForList(
            "SELECT i.id,i.project_id AS projectId,CONCAT(p.project_key,'-',i.issue_number) AS `key`,i.issue_number AS number,i.title,i.issue_type AS type,i.status,i.priority,i.assignee_id AS assigneeId,u.display_name AS assigneeName,i.start_date AS startDate,i.due_date AS dueDate,i.done_ratio AS progress,i.story_points AS storyPoints,i.parent_issue_id AS parentId,i.version_id AS versionId,i.sprint_id AS sprintId,i.version,i.updated_at AS updatedAt FROM issues i JOIN projects p ON p.id=i.project_id LEFT JOIN users u ON u.id=i.assignee_id WHERE i.deleted_at IS NULL AND i.project_id IN ($marks) ORDER BY i.project_id,i.issue_number",
            *ids,
        )
        val relations = jdbc.queryForList(
            "SELECT r.id,r.source_issue_id AS fromId,r.target_issue_id AS toId,r.relation_type AS type FROM issue_relations r JOIN issues a ON a.id=r.source_issue_id JOIN issues b ON b.id=r.target_issue_id WHERE r.project_id IN ($marks) AND a.deleted_at IS NULL AND b.deleted_at IS NULL",
            *ids,
        )
        return mapOf("projects" to projects, "versions" to versions, "issues" to issues, "relations" to relations)
    }
}
