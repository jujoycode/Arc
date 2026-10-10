package io.arcapp.backend.ticketfield.internal

import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.ticketfield.api.*
import io.arcapp.backend.ticketfield.internal.persistence.TicketFieldRepository
import io.arcapp.backend.workspace.api.WorkspaceAccess
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class TicketFieldPolicyInput(val revision: Long, val standardFields: List<StandardTicketField>, val customFields: List<CustomTicketField>)

@Service
class TicketFieldService(private val repository: TicketFieldRepository, private val workspaces: WorkspaceAccess) {
    fun get(actorId: Long, workspaceId: Long): TicketFieldPolicy {
        workspaces.role(workspaceId, actorId)
        return repository.find(workspaceId) ?: defaultTicketFieldPolicy(workspaceId)
    }
    @Transactional
    fun save(actorId: Long, workspaceId: Long, input: TicketFieldPolicyInput): TicketFieldPolicy {
        workspaces.forUpdate(workspaceId, actorId)
        workspaces.requireManager(workspaceId, actorId)
        val old = get(actorId, workspaceId)
        requireRevision(old, input.revision)
        val next = TicketFieldPolicy(workspaceId, old.revision + 1, input.standardFields, input.customFields)
        validateTicketFieldPolicy(next, old)
        repository.save(next)
        return next
    }
    /** Must participate in the caller's Spring transaction, before its project lock. */
    fun forPlan(actorId: Long, workspaceId: Long, revision: Long?): TicketFieldPolicy {
        workspaces.forUpdate(workspaceId, actorId)
        return get(actorId, workspaceId).also { if (revision != null) requireRevision(it, revision) }
    }
    private fun requireRevision(policy: TicketFieldPolicy, revision: Long) {
        if (policy.revision != revision) throw ApiError(HttpStatus.CONFLICT,
            "워크스페이스 티켓 필드 설정이 변경되었습니다. 최신 설정을 확인해 주세요.", "TICKET_FIELDS_CHANGED")
    }
}
