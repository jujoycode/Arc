package io.arcapp.backend.workspace.web

import io.arcapp.backend.shared.web.userId
import io.arcapp.backend.workspace.internal.MemberRoleInput
import io.arcapp.backend.workspace.internal.MembershipService
import io.arcapp.backend.workspace.internal.WorkspaceDeleteInput
import jakarta.servlet.http.HttpServletRequest
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/auth/workspaces/{workspaceId}")
class MembershipController(private val service: MembershipService) {
    @DeleteMapping fun delete(request: HttpServletRequest, @PathVariable workspaceId: Long, @RequestBody input: WorkspaceDeleteInput) = service.delete(request.userId(), workspaceId, input)
    @GetMapping("/invitations") fun invitations(request: HttpServletRequest, @PathVariable workspaceId: Long) = service.invitations(request.userId(), workspaceId)
    @DeleteMapping("/invitations/{id}") fun revoke(request: HttpServletRequest, @PathVariable workspaceId: Long, @PathVariable id: Long) = service.revoke(request.userId(), workspaceId, id)
    @PatchMapping("/members/{userId}/role") fun changeRole(request: HttpServletRequest, @PathVariable workspaceId: Long, @PathVariable userId: Long, @RequestBody input: MemberRoleInput) = service.changeRole(request.userId(), workspaceId, userId, input)
    @PostMapping("/owner/{userId}") fun transferOwner(request: HttpServletRequest, @PathVariable workspaceId: Long, @PathVariable userId: Long) = service.transferOwner(request.userId(), workspaceId, userId)
    @DeleteMapping("/members/{userId}") fun removeMember(request: HttpServletRequest, @PathVariable workspaceId: Long, @PathVariable userId: Long) = service.removeMember(request.userId(), workspaceId, userId)
}
