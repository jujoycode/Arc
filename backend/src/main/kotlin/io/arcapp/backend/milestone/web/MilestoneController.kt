package io.arcapp.backend.milestone.web

import io.arcapp.backend.milestone.api.*
import io.arcapp.backend.milestone.internal.MilestoneService
import io.arcapp.backend.shared.web.userId
import jakarta.servlet.http.HttpServletRequest
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/projects/{projectId}/milestones")
class MilestoneController(private val service: MilestoneService) {
    @GetMapping fun list(request: HttpServletRequest, @PathVariable projectId: Long,
        @RequestParam(defaultValue = "0") page: Int, @RequestParam(defaultValue = "50") size: Int) = service.list(request.userId(), projectId, page, size)
    @PostMapping fun create(request: HttpServletRequest, @PathVariable projectId: Long,
        @RequestBody input: MilestoneInput) = service.create(request.userId(), projectId, input)
    @GetMapping("/{id}") fun get(request: HttpServletRequest, @PathVariable projectId: Long,
        @PathVariable id: Long) = service.get(request.userId(), projectId, id)
    @PutMapping("/{id}") fun update(request: HttpServletRequest, @PathVariable projectId: Long,
        @PathVariable id: Long, @RequestBody input: MilestoneEdit) = service.update(request.userId(), projectId, id, input)
    @PostMapping("/{id}/cancel") fun cancel(request: HttpServletRequest, @PathVariable projectId: Long,
        @PathVariable id: Long, @RequestBody input: MilestoneTransition) = service.cancel(request.userId(), projectId, id, input)
    @PostMapping("/{id}/reopen") fun reopen(request: HttpServletRequest, @PathVariable projectId: Long,
        @PathVariable id: Long, @RequestBody input: MilestoneTransition) = service.reopen(request.userId(), projectId, id, input)
    @GetMapping("/{id}/activities") fun activities(request: HttpServletRequest, @PathVariable projectId: Long,
        @PathVariable id: Long, @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "50") size: Int) = service.activities(request.userId(), projectId, id, page, size)
}
