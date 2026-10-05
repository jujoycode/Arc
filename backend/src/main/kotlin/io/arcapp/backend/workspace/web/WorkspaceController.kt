package io.arcapp.backend.workspace.web

import io.arcapp.backend.shared.web.userId
import io.arcapp.backend.workspace.internal.InviteInput
import io.arcapp.backend.workspace.internal.WorkspaceInput
import io.arcapp.backend.workspace.internal.WorkspaceService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/auth")
class WorkspaceController(private val service: WorkspaceService) {
    @GetMapping("/workspaces") fun list(request: HttpServletRequest) = service.list(request.userId())
    @PostMapping("/workspaces") fun create(request: HttpServletRequest, @RequestBody input: WorkspaceInput) = service.create(request.userId(), input)
    @GetMapping("/workspaces/{id}/members") fun members(request: HttpServletRequest, @PathVariable id: Long) = service.members(request.userId(), id)
    @PostMapping("/workspaces/{id}/invitations") fun invite(request: HttpServletRequest, @PathVariable id: Long, @RequestBody input: InviteInput) = service.invite(request.userId(), id, input)
    @PostMapping("/invitations/accept") fun accept(request: HttpServletRequest, @RequestParam token: String) = service.accept(request.userId(), token)
}
