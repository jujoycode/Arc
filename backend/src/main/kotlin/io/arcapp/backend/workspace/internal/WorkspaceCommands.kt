package io.arcapp.backend.workspace.internal

data class WorkspaceInput(val name: String)
data class InviteInput(val email: String, val role: String = "MEMBER")
data class MemberRoleInput(val role: String)
data class WorkspaceDeleteInput(val confirmation: String)
