package io.arcapp.backend.ticketfield.api

import io.arcapp.backend.ticketfield.internal.TicketFieldService
import io.arcapp.backend.ticketfield.internal.validateTicketFieldValues
import org.springframework.stereotype.Service

/** Issue owns its data and transaction; policies provide validation without knowing Issue internals. */
@Service
class TicketFields(private val service: TicketFieldService) {
    fun forPlan(actorId: Long, workspaceId: Long, revision: Long?) = service.forPlan(actorId, workspaceId, revision)
    fun validate(policy: TicketFieldPolicy, standard: Map<String, Any?>, supplied: Map<String, Any?>?, previous: Map<String, Any?> = emptyMap()) =
        validateTicketFieldValues(policy, standard, supplied, previous)
}
