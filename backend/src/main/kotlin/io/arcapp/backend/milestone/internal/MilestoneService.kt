package io.arcapp.backend.milestone.internal

import io.arcapp.backend.milestone.api.*
import io.arcapp.backend.milestone.internal.persistence.MilestoneRepository
import io.arcapp.backend.project.api.ProjectAccess
import io.arcapp.backend.project.api.ProjectContext
import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.workspace.api.WorkspaceAccess
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional

@Service
class MilestoneService(private val repository: MilestoneRepository, private val projects: ProjectAccess,
    private val workspaces: WorkspaceAccess) {
    fun list(actorId: Long, projectId: Long, page: Int, size: Int): MilestonePage<MilestoneDetail> {
        projects.get(projectId, actorId)
        return repository.list(projectId, page.coerceAtLeast(0), size.coerceIn(1, 100))
    }
    fun get(actorId: Long, projectId: Long, id: Long): MilestoneDetail {
        projects.get(projectId, actorId)
        return find(projectId, id)
    }
    fun activities(actorId: Long, projectId: Long, id: Long, page: Int, size: Int): MilestonePage<MilestoneActivity> {
        get(actorId, projectId, id)
        return repository.activities(id, page.coerceAtLeast(0), size.coerceIn(1, 100))
    }
    /** Current permission reads after waiting must observe committed revocations. */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun create(actorId: Long, projectId: Long, input: MilestoneInput): MilestoneDetail {
        val project = writableProject(actorId, projectId)
        val metadata = validateMetadata(input)
        links(project, metadata, null)
        val snapshot = metadata.snapshot(MilestoneStatus.PLANNED, 0)
        val id = repository.create(projectId, snapshot)
        repository.append(id, actorId, MilestoneEvent.CREATED,
            MilestoneHistoryPayload(previousRevision = null, revision = 0, reason = null, before = null, after = snapshot))
        return find(projectId, id)
    }
    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun update(actorId: Long, projectId: Long, id: Long, input: MilestoneEdit): MilestoneDetail {
        val project = writableProject(actorId, projectId)
        val before = find(projectId, id, true).snapshot()
        requireMilestoneRevision(before, validateRevision(input.revision))
        requireMilestoneState(before, MilestoneStatus.PLANNED)
        val metadata = validateMetadata(input.metadata())
        val reason = validateReason(input.reason, before.targetDate != metadata.targetDate)
        links(project, metadata, before)
        val after = metadata.snapshot(MilestoneStatus.PLANNED, nextRevision(before))
        change(projectId, id, actorId, MilestoneEvent.UPDATED, reason, before, after)
        return find(projectId, id)
    }
    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun cancel(actorId: Long, projectId: Long, id: Long, input: MilestoneTransition): MilestoneDetail =
        transition(actorId, projectId, id, input, MilestoneEvent.CANCELLED, MilestoneStatus.PLANNED, MilestoneStatus.CANCELLED)
    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun reopen(actorId: Long, projectId: Long, id: Long, input: MilestoneTransition): MilestoneDetail =
        transition(actorId, projectId, id, input, MilestoneEvent.REOPENED, MilestoneStatus.CANCELLED, MilestoneStatus.PLANNED)

    private fun transition(actorId: Long, projectId: Long, id: Long, input: MilestoneTransition,
        type: MilestoneEvent, expected: MilestoneStatus, status: MilestoneStatus): MilestoneDetail {
        writableProject(actorId, projectId)
        val before = find(projectId, id, true).snapshot()
        requireMilestoneRevision(before, validateRevision(input.revision))
        val reason = validateReason(input.reason, true)
        requireMilestoneState(before, expected)
        change(projectId, id, actorId, type, reason, before, before.copy(status = status, revision = nextRevision(before)))
        return find(projectId, id)
    }
    private fun writableProject(actorId: Long, projectId: Long): ProjectContext {
        val initial = projects.get(projectId, actorId)
        workspaces.forUpdate(initial.workspaceId, actorId)
        val locked = projects.forUpdate(projectId, actorId)
        projects.requireManager(locked, actorId)
        locked.requireActive()
        return locked
    }
    private fun links(project: ProjectContext, input: MilestoneInput, before: MilestoneSnapshot?) {
        if (input.ownerId != null && input.ownerId != before?.ownerId && !workspaces.containsMember(project.workspaceId, input.ownerId))
            throw ApiError(HttpStatus.BAD_REQUEST, "워크스페이스 멤버를 담당자로 지정해 주세요.", "VALIDATION_FAILED", mapOf("ownerId" to "워크스페이스 멤버가 아닙니다."))
        if (input.versionId != null && !projects.containsVersion(project.id, input.versionId))
            throw ApiError(HttpStatus.BAD_REQUEST, "현재 프로젝트의 버전을 지정해 주세요.", "VALIDATION_FAILED", mapOf("versionId" to "현재 프로젝트의 버전이 아닙니다."))
    }
    private fun find(projectId: Long, id: Long, lock: Boolean = false) = repository.find(projectId, id, lock)
        ?: throw ApiError(HttpStatus.NOT_FOUND, "마일스톤이 없습니다.")
    private fun nextRevision(before: MilestoneSnapshot): Long {
        if (before.revision == Long.MAX_VALUE) throw ApiError(HttpStatus.CONFLICT, "마일스톤 revision 한도에 도달했습니다.", "MILESTONE_CHANGED")
        return before.revision + 1
    }
    private fun change(projectId: Long, id: Long, actorId: Long, type: MilestoneEvent, reason: String?,
        before: MilestoneSnapshot, after: MilestoneSnapshot) {
        if (!repository.update(projectId, id, before.revision, after)) throw ApiError(HttpStatus.CONFLICT,
            "마일스톤이 변경되었습니다. 최신 내용을 확인해 주세요.", "MILESTONE_CHANGED")
        repository.append(id, actorId, type, MilestoneHistoryPayload(previousRevision = before.revision,
            revision = after.revision, reason = reason, before = before, after = after))
    }
    private fun MilestoneInput.snapshot(status: MilestoneStatus, revision: Long) =
        MilestoneSnapshot(requireNotNull(title), requireNotNull(targetDate), requireNotNull(criteria), description, ownerId, versionId, status, revision)
}
