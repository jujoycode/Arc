package io.arcapp.backend.project.api

import io.arcapp.backend.project.internal.persistence.ProjectRepository
import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.shared.persistence.long
import io.arcapp.backend.workspace.api.WorkspaceAccess
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

data class ProjectContext(val id: Long, val workspaceId: Long, val key: String, val archived: Boolean) {
    fun requireActive() { if (archived) throw ApiError(HttpStatus.CONFLICT, "보관된 프로젝트입니다.") }
}

data class IssueNumber(val number: Int, val key: String)

@Service
class ProjectAccess(private val repository: ProjectRepository, private val workspaces: WorkspaceAccess) {
    fun get(projectId: Long, userId: Long): ProjectContext {
        val row = repository.find(projectId) ?: throw ApiError(HttpStatus.NOT_FOUND, "프로젝트가 없습니다.")
        workspaces.role(row.long("workspace_id"), userId)
        return ProjectContext(projectId, row.long("workspace_id"), row["project_key"] as String, row["archived_at"] != null)
    }

    /** Called inside the caller's transaction to serialize project mutations. */
    fun forUpdate(projectId: Long, userId: Long): ProjectContext {
        get(projectId, userId)
        val row = repository.lock(projectId)
        return ProjectContext(projectId, row.long("workspace_id"), row["project_key"] as String, row["archived_at"] != null)
    }

    fun allocateIssueNumber(project: ProjectContext): IssueNumber = IssueNumber(repository.allocateIssueNumber(project.id), project.key)
    fun containsVersion(projectId: Long, versionId: Long): Boolean = repository.containsVersion(projectId, versionId)
}
