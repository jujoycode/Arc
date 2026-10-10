package io.arcapp.backend.ticketfield.web

import io.arcapp.backend.shared.web.userId
import io.arcapp.backend.ticketfield.internal.TicketFieldPolicyInput
import io.arcapp.backend.ticketfield.internal.TicketFieldService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/auth/workspaces/{workspaceId}/ticket-fields")
class TicketFieldController(private val service: TicketFieldService) {
    @GetMapping fun get(request: HttpServletRequest, @PathVariable workspaceId: Long) = service.get(request.userId(), workspaceId)
    @PutMapping fun save(request: HttpServletRequest, @PathVariable workspaceId: Long, @RequestBody input: TicketFieldPolicyInput) = service.save(request.userId(), workspaceId, input)
}
