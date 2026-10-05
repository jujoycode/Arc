package io.arcapp.backend.sprint.web

import io.arcapp.backend.shared.web.userId
import io.arcapp.backend.sprint.internal.*
import jakarta.servlet.http.HttpServletRequest
import org.springframework.web.bind.annotation.*

@RestController
class SprintController(private val service: SprintService) {
    @GetMapping("/api/projects/{projectId}/sprints")
    fun list(request: HttpServletRequest, @PathVariable projectId: Long) = service.list(request.userId(), projectId)
    @PostMapping("/api/projects/{projectId}/sprints")
    fun create(request: HttpServletRequest, @PathVariable projectId: Long, @RequestBody input: SprintInput) = service.create(request.userId(), projectId, input)
    @PostMapping("/api/projects/{projectId}/sprints/{id}/start")
    fun start(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long) = service.start(request.userId(), projectId, id)
    @PostMapping("/api/projects/{projectId}/sprints/{id}/close")
    fun close(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long, @RequestBody input: SprintClose) = service.close(request.userId(), projectId, id, input)
    @GetMapping("/api/projects/{projectId}/sprints/{id}/history")
    fun history(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long) = service.history(request.userId(), projectId, id)
    @PutMapping("/api/projects/{projectId}/issues/{issueId}/sprint")
    fun assign(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable issueId: Long, @RequestBody input: SprintAssignment) = service.assign(request.userId(), projectId, issueId, input)
    @PutMapping("/api/projects/{projectId}/backlog/order")
    fun reorder(request: HttpServletRequest, @PathVariable projectId: Long, @RequestBody input: BacklogOrder) = service.reorder(request.userId(), projectId, input)
}
