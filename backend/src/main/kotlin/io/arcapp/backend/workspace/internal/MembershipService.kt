package io.arcapp.backend.workspace.internal

import io.arcapp.backend.workspace.api.WorkspaceAccess
import io.arcapp.backend.workspace.internal.persistence.MembershipRepository
import org.springframework.stereotype.Service

@Service
class MembershipService(private val access: WorkspaceAccess, private val repository: MembershipRepository) {
    fun delete(userId: Long, workspaceId: Long, input: WorkspaceDeleteInput) { access.requireOwner(workspaceId, userId); repository.deleteWorkspace(userId, workspaceId, input) }
    fun invitations(userId: Long, workspaceId: Long): List<Map<String, Any?>> { access.requireManager(workspaceId, userId); return repository.invitations(workspaceId) }
    fun revoke(userId: Long, workspaceId: Long, id: Long) { access.requireManager(workspaceId, userId); repository.revoke(userId, workspaceId, id) }
    fun changeRole(actorId: Long, workspaceId: Long, userId: Long, input: MemberRoleInput) { access.requireManager(workspaceId, actorId); repository.changeRole(actorId, workspaceId, userId, input) }
    fun transferOwner(actorId: Long, workspaceId: Long, userId: Long) { access.requireOwner(workspaceId, actorId); repository.transferOwner(actorId, workspaceId, userId) }
    fun removeMember(actorId: Long, workspaceId: Long, userId: Long) { access.requireManager(workspaceId, actorId); repository.removeMember(actorId, workspaceId, userId) }
}
