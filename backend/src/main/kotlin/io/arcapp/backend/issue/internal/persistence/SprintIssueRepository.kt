package io.arcapp.backend.issue.internal.persistence

import io.arcapp.backend.shared.persistence.one
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class SprintIssueRepository(private val jdbc: JdbcTemplate) {
    fun totals(projectId: Long, sprintId: Long) = jdbc.one("SELECT COUNT(*) AS issueCount,COALESCE(SUM(story_points),0) AS storyPoints FROM issues WHERE project_id=? AND sprint_id=? AND deleted_at IS NULL", projectId, sprintId)!!
    fun recordResult(projectId: Long, sprintId: Long) {
        jdbc.update("INSERT INTO sprint_issue_history(sprint_id,issue_id,final_status,final_story_points) SELECT ?,id,status,story_points FROM issues WHERE project_id=? AND sprint_id=? AND deleted_at IS NULL", sprintId, projectId, sprintId)
    }
    fun summary(projectId: Long, sprintId: Long) = jdbc.one("SELECT COUNT(*) AS issueCount,COALESCE(SUM(status='DONE'),0) AS doneCount,COALESCE(SUM(story_points),0) AS storyPoints,COALESCE(SUM(IF(status='DONE',story_points,0)),0) AS donePoints,COALESCE(SUM(IF(status<>'DONE',story_points,0)),0) AS remainingPoints FROM issues WHERE project_id=? AND sprint_id=? AND deleted_at IS NULL", projectId, sprintId)!!
    fun moveAfterClose(actorId: Long, projectId: Long, sprintId: Long, nextSprintId: Long?) {
        jdbc.update("INSERT INTO issue_activities(issue_id,actor_id,event_type) SELECT id,?,'SPRINT_CHANGED' FROM issues WHERE project_id=? AND sprint_id=? AND deleted_at IS NULL", actorId, projectId, sprintId)
        jdbc.update("UPDATE issues SET sprint_id=?,version=version+1 WHERE project_id=? AND sprint_id=? AND status<>'DONE' AND deleted_at IS NULL", nextSprintId, projectId, sprintId)
        jdbc.update("UPDATE issues SET sprint_id=NULL,version=version+1 WHERE project_id=? AND sprint_id=? AND deleted_at IS NULL", projectId, sprintId)
    }
    fun history(sprintId: Long) = jdbc.queryForList("SELECT h.issue_id AS issueId,CONCAT(p.project_key,'-',i.issue_number) AS `key`,i.title,h.final_status AS finalStatus,h.final_story_points AS finalStoryPoints,h.recorded_at AS recordedAt FROM sprint_issue_history h JOIN issues i ON i.id=h.issue_id JOIN projects p ON p.id=i.project_id WHERE h.sprint_id=?", sprintId)
    fun assign(projectId: Long, issueId: Long, sprintId: Long?) = jdbc.update("UPDATE issues SET sprint_id=?,version=version+1 WHERE id=? AND project_id=? AND deleted_at IS NULL", sprintId, issueId, projectId)
    fun reorder(projectId: Long, issueId: Long, index: Int) = jdbc.update("UPDATE issues SET sort_order=?,version=version+1 WHERE id=? AND project_id=? AND sprint_id IS NULL AND deleted_at IS NULL", index.toLong(), issueId, projectId)
}
