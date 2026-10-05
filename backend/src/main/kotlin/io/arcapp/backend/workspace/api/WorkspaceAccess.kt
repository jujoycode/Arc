package io.arcapp.backend.workspace.api

import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.workspace.internal.persistence.WorkspaceRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

@Service
class WorkspaceAccess(private val repository: WorkspaceRepository) {
    fun containsMember(workspaceId: Long, userId: Long): Boolean = repository.role(workspaceId, userId) != null
    fun role(workspaceId: Long, userId: Long): String = repository.role(workspaceId, userId)
        ?: throw ApiError(HttpStatus.FORBIDDEN, "워크스페이스 접근 권한이 없습니다.")
    fun requireManager(workspaceId: Long, userId: Long) {
        if (role(workspaceId, userId) !in setOf("OWNER", "ADMIN")) throw ApiError(HttpStatus.FORBIDDEN, "관리자 권한이 필요합니다.")
    }
    fun requireOwner(workspaceId: Long, userId: Long) {
        if (role(workspaceId, userId) != "OWNER") throw ApiError(HttpStatus.FORBIDDEN, "소유자 권한이 필요합니다.")
    }
}
