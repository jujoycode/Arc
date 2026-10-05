package io.arcapp.backend

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.sql.Date

data class SprintInput(val name: String, val goal: String? = null, val startOn: String, val endOn: String)
data class SprintAssignment(val sprintId: Long?)
data class BacklogOrder(val issueIds: List<Long>)
data class SprintClose(val nextSprintId: Long? = null)

@RestController
class SprintApi(private val jdbc: JdbcTemplate) {
    @GetMapping("/api/projects/{projectId}/sprints")
    fun list(request: HttpServletRequest, @PathVariable projectId: Long): List<Map<String, Any?>> {
        projectRow(jdbc, projectId, request.userId())
        return jdbc.queryForList("SELECT id,name,goal,start_on AS startOn,end_on AS endOn,status,started_at AS startedAt,completed_at AS completedAt FROM sprints WHERE project_id=? ORDER BY id DESC", projectId)
    }

    @PostMapping("/api/projects/{projectId}/sprints")
    fun create(request: HttpServletRequest, @PathVariable projectId: Long, @RequestBody input: SprintInput): Map<String, Long> {
        val project = projectRow(jdbc, projectId, request.userId())
        requireManager(jdbc, project.long("workspace_id"), request.userId())
        if (project["archived_at"] != null) throw ApiError(HttpStatus.CONFLICT, "보관된 프로젝트입니다.")
        val startDate: Date
        val endDate: Date
        try {
            startDate = Date.valueOf(input.startOn)
            endDate = Date.valueOf(input.endOn)
        } catch (_: IllegalArgumentException) { throw ApiError(HttpStatus.BAD_REQUEST, "스프린트 이름과 기간을 확인해 주세요.") }
        if (input.name.isBlank() || input.name.length > 120 || startDate.after(endDate)) throw ApiError(HttpStatus.BAD_REQUEST, "스프린트 이름과 기간을 확인해 주세요.")
        val id = jdbc.insert("INSERT INTO sprints(project_id,name,goal,start_on,end_on,status) VALUES(?,?,?,?,?,'PLANNED')", projectId, input.name.trim(), input.goal, startDate, endDate)
        return mapOf("id" to id)
    }

    @PostMapping("/api/projects/{projectId}/sprints/{id}/start")
    @Transactional
    fun start(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long): Map<String, Any?> {
        val project = projectRow(jdbc, projectId, request.userId())
        requireManager(jdbc, project.long("workspace_id"), request.userId())
        jdbc.one("SELECT id FROM projects WHERE id=? FOR UPDATE", projectId)
        val sprint = sprint(projectId, id)
        if (sprint["status"] != "PLANNED") throw ApiError(HttpStatus.CONFLICT, "계획 상태의 스프린트만 시작할 수 있습니다.")
        if (jdbc.one("SELECT id FROM sprints WHERE project_id=? AND status='ACTIVE'", projectId) != null)
            throw ApiError(HttpStatus.CONFLICT, "이미 진행 중인 스프린트가 있습니다.")
        val totals = jdbc.one("SELECT COUNT(*) AS issueCount,COALESCE(SUM(story_points),0) AS storyPoints FROM issues WHERE project_id=? AND sprint_id=? AND deleted_at IS NULL", projectId, id)!!
        jdbc.update("UPDATE sprints SET status='ACTIVE',started_at=UTC_TIMESTAMP(6) WHERE id=?", id)
        return totals
    }

    @PostMapping("/api/projects/{projectId}/sprints/{id}/close")
    @Transactional
    fun close(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long, @RequestBody input: SprintClose): Map<String, Any?> {
        val project = projectRow(jdbc, projectId, request.userId())
        requireManager(jdbc, project.long("workspace_id"), request.userId())
        val sprint = sprint(projectId, id)
        if (sprint["status"] != "ACTIVE") throw ApiError(HttpStatus.CONFLICT, "진행 중인 스프린트만 종료할 수 있습니다.")
        if (input.nextSprintId != null && (input.nextSprintId == id || sprint(projectId, input.nextSprintId)["status"] != "PLANNED"))
            throw ApiError(HttpStatus.BAD_REQUEST, "다음 계획 스프린트를 선택해 주세요.")
        jdbc.update("INSERT INTO sprint_issue_history(sprint_id,issue_id,final_status,final_story_points) SELECT ?,id,status,story_points FROM issues WHERE project_id=? AND sprint_id=? AND deleted_at IS NULL", id, projectId, id)
        val summary = jdbc.one("SELECT COUNT(*) AS issueCount,SUM(status='DONE') AS doneCount,COALESCE(SUM(story_points),0) AS storyPoints FROM issues WHERE project_id=? AND sprint_id=? AND deleted_at IS NULL", projectId, id)!!
        jdbc.update("UPDATE issues SET sprint_id=?,version=version+1 WHERE project_id=? AND sprint_id=? AND status<>'DONE'", input.nextSprintId, projectId, id)
        jdbc.update("UPDATE issues SET sprint_id=NULL,version=version+1 WHERE project_id=? AND sprint_id=?", projectId, id)
        jdbc.update("UPDATE sprints SET status='CLOSED',completed_at=UTC_TIMESTAMP(6) WHERE id=?", id)
        return summary
    }

    @GetMapping("/api/projects/{projectId}/sprints/{id}/history")
    fun history(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long): List<Map<String, Any?>> {
        projectRow(jdbc, projectId, request.userId()); sprint(projectId, id)
        return jdbc.queryForList("SELECT h.issue_id AS issueId,CONCAT(p.project_key,'-',i.issue_number) AS `key`,i.title,h.final_status AS finalStatus,h.final_story_points AS finalStoryPoints,h.recorded_at AS recordedAt FROM sprint_issue_history h JOIN issues i ON i.id=h.issue_id JOIN projects p ON p.id=i.project_id WHERE h.sprint_id=?", id)
    }

    @PutMapping("/api/projects/{projectId}/issues/{issueId}/sprint")
    @Transactional
    fun assign(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable issueId: Long, @RequestBody input: SprintAssignment) {
        val project = projectRow(jdbc, projectId, request.userId())
        if (project["archived_at"] != null) throw ApiError(HttpStatus.CONFLICT, "보관된 프로젝트입니다.")
        if (jdbc.one("SELECT id FROM issues WHERE id=? AND project_id=? AND deleted_at IS NULL", issueId, projectId) == null)
            throw ApiError(HttpStatus.NOT_FOUND, "이슈가 없습니다.")
        if (input.sprintId != null && sprint(projectId, input.sprintId)["status"] != "PLANNED")
            throw ApiError(HttpStatus.BAD_REQUEST, "계획 중인 스프린트에만 편성할 수 있습니다.")
        jdbc.update("UPDATE issues SET sprint_id=?,version=version+1 WHERE id=?", input.sprintId, issueId)
        jdbc.update("INSERT INTO issue_activities(issue_id,actor_id,event_type) VALUES(?,?,'SPRINT_CHANGED')", issueId, request.userId())
    }

    @PutMapping("/api/projects/{projectId}/backlog/order")
    @Transactional
    fun reorder(request: HttpServletRequest, @PathVariable projectId: Long, @RequestBody input: BacklogOrder) {
        projectRow(jdbc, projectId, request.userId())
        if (input.issueIds.distinct().size != input.issueIds.size) throw ApiError(HttpStatus.BAD_REQUEST, "중복 이슈가 있습니다.")
        input.issueIds.forEachIndexed { index, issueId ->
            val changed = jdbc.update("UPDATE issues SET sort_order=?,version=version+1 WHERE id=? AND project_id=? AND sprint_id IS NULL AND deleted_at IS NULL", index.toLong(), issueId, projectId)
            if (changed == 0) throw ApiError(HttpStatus.BAD_REQUEST, "백로그 이슈만 정렬할 수 있습니다.")
        }
    }

    private fun sprint(projectId: Long, id: Long): Map<String, Any?> = jdbc.one("SELECT * FROM sprints WHERE id=? AND project_id=?", id, projectId)
        ?: throw ApiError(HttpStatus.NOT_FOUND, "스프린트가 없습니다.")
}
