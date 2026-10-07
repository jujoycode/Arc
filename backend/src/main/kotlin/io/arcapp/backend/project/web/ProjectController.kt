package io.arcapp.backend.project.web

import io.arcapp.backend.project.internal.ProjectEdit
import io.arcapp.backend.project.internal.ProjectInput
import io.arcapp.backend.project.internal.ProjectService
import io.arcapp.backend.project.internal.VersionInput
import io.arcapp.backend.shared.web.userId
import jakarta.servlet.http.HttpServletRequest
import org.springframework.web.bind.annotation.*

@RestController
class ProjectController(private val service: ProjectService) {
    @GetMapping("/api/workspaces/{workspaceId}/projects") fun list(request: HttpServletRequest, @PathVariable workspaceId: Long) = service.list(request.userId(), workspaceId)
    @PostMapping("/api/workspaces/{workspaceId}/projects") fun create(request: HttpServletRequest, @PathVariable workspaceId: Long, @RequestBody input: ProjectInput) = service.create(request.userId(), workspaceId, input)
    @GetMapping("/api/projects/{id}") fun get(request: HttpServletRequest, @PathVariable id: Long) = service.get(request.userId(), id)
    @PutMapping("/api/projects/{id}/managers/{managerId}") fun addManager(request: HttpServletRequest, @PathVariable id: Long, @PathVariable managerId: Long) = service.addManager(request.userId(), id, managerId)
    @DeleteMapping("/api/projects/{id}/managers/{managerId}") fun removeManager(request: HttpServletRequest, @PathVariable id: Long, @PathVariable managerId: Long) = service.removeManager(request.userId(), id, managerId)
    @PutMapping("/api/projects/{id}") fun update(request: HttpServletRequest, @PathVariable id: Long, @RequestBody input: ProjectEdit) = service.update(request.userId(), id, input)
    @GetMapping("/api/projects/{id}/versions") fun versions(request: HttpServletRequest, @PathVariable id: Long) = service.versions(request.userId(), id)
    @PostMapping("/api/projects/{id}/versions") fun createVersion(request: HttpServletRequest, @PathVariable id: Long, @RequestBody input: VersionInput) = service.createVersion(request.userId(), id, input)
}
