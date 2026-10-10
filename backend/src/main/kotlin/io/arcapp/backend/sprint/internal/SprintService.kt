package io.arcapp.backend.sprint.internal

import io.arcapp.backend.issue.api.SprintIssueOperations
import io.arcapp.backend.project.api.ProjectAccess
import io.arcapp.backend.project.api.ProjectContext
import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.shared.api.calendarDate
import io.arcapp.backend.sprint.internal.persistence.SprintRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Date

@Service
class SprintService(private val repository: SprintRepository, private val projects: ProjectAccess, private val issues: SprintIssueOperations) {
    fun list(actorId: Long, projectId: Long): List<Map<String, Any?>> { projects.get(projectId, actorId); return repository.list(projectId) }

    @Transactional
    fun create(actorId: Long, projectId: Long, input: SprintInput): Map<String, Long> {
        managedProject(actorId, projectId)
        val startDate = calendarDate(input.startOn, "startOn")
        val endDate = calendarDate(input.endOn, "endOn")
        if (input.name.isBlank() || input.name.length > 120) throw ApiError(HttpStatus.BAD_REQUEST,
            "스프린트 이름을 확인해 주세요.", "VALIDATION_FAILED", mapOf("name" to "이름은 1~120자로 입력해 주세요."))
        if (endDate < startDate) throw ApiError(HttpStatus.BAD_REQUEST,
            "스프린트 기간을 확인해 주세요.", "VALIDATION_FAILED", mapOf("endOn" to "종료일은 시작일보다 빠를 수 없습니다."))
        return mapOf("id" to repository.create(projectId, input.name.trim(), input.goal, Date.valueOf(startDate), Date.valueOf(endDate)))
    }

    @Transactional
    fun start(actorId: Long, projectId: Long, id: Long): Map<String, Any?> {
        managedProject(actorId, projectId)
        if (sprint(projectId, id)["status"] != "PLANNED") throw ApiError(HttpStatus.CONFLICT, "계획 상태의 스프린트만 시작할 수 있습니다.")
        if (repository.hasActive(projectId)) throw ApiError(HttpStatus.CONFLICT, "이미 진행 중인 스프린트가 있습니다.")
        val totals = issues.totals(projectId, id)
        repository.start(id)
        return totals
    }

    @Transactional
    fun close(actorId: Long, projectId: Long, id: Long, input: SprintClose): Map<String, Any?> {
        managedProject(actorId, projectId)
        if (sprint(projectId, id)["status"] != "ACTIVE") throw ApiError(HttpStatus.CONFLICT, "진행 중인 스프린트만 종료할 수 있습니다.")
        if (input.nextSprintId != null && (input.nextSprintId == id || sprint(projectId, input.nextSprintId)["status"] != "PLANNED")) throw ApiError(HttpStatus.BAD_REQUEST, "다음 계획 스프린트를 선택해 주세요.")
        val summary = issues.close(actorId, projectId, id, input.nextSprintId)
        repository.close(id)
        return summary
    }

    fun history(actorId: Long, projectId: Long, id: Long): List<Map<String, Any?>> { projects.get(projectId, actorId); sprint(projectId, id); return issues.history(id) }

    @Transactional
    fun assign(actorId: Long, projectId: Long, issueId: Long, input: SprintAssignment) {
        managedProject(actorId, projectId)
        if (input.sprintId != null && sprint(projectId, input.sprintId)["status"] != "PLANNED") throw ApiError(HttpStatus.BAD_REQUEST, "계획 중인 스프린트에만 편성할 수 있습니다.")
        issues.assign(actorId, projectId, issueId, input.sprintId)
    }

    @Transactional
    fun reorder(actorId: Long, projectId: Long, input: BacklogOrder) { managedProject(actorId, projectId); issues.reorder(projectId, input.issueIds) }
    private fun sprint(projectId: Long, id: Long): Map<String, Any?> = repository.find(projectId, id) ?: throw ApiError(HttpStatus.NOT_FOUND, "스프린트가 없습니다.")
    private fun activeProject(actorId: Long, projectId: Long): ProjectContext = projects.forUpdate(projectId, actorId).also { it.requireActive() }
    private fun managedProject(actorId: Long, projectId: Long): ProjectContext = activeProject(actorId, projectId).also { projects.requireManager(it, actorId) }
}
