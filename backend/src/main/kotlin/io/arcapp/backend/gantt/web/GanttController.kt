package io.arcapp.backend.gantt.web

import io.arcapp.backend.gantt.internal.GanttQueryService
import io.arcapp.backend.shared.web.userId
import jakarta.servlet.http.HttpServletRequest
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController

@RestController
class GanttController(private val service: GanttQueryService) {
    @GetMapping("/api/projects/{projectId}/gantt")
    fun get(request: HttpServletRequest, @PathVariable projectId: Long) = service.get(request.userId(), projectId)
}
