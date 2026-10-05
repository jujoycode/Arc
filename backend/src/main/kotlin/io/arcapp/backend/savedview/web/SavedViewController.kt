package io.arcapp.backend.savedview.web

import io.arcapp.backend.savedview.internal.SavedViewInput
import io.arcapp.backend.savedview.internal.SavedViewService
import io.arcapp.backend.shared.web.userId
import jakarta.servlet.http.HttpServletRequest
import org.springframework.web.bind.annotation.*

@RestController
class SavedViewController(private val service: SavedViewService) {
    @GetMapping("/api/projects/{projectId}/saved-views")
    fun list(request: HttpServletRequest, @PathVariable projectId: Long) = service.list(request.userId(), projectId)
    @PostMapping("/api/projects/{projectId}/saved-views")
    fun create(request: HttpServletRequest, @PathVariable projectId: Long, @RequestBody input: SavedViewInput) = service.create(request.userId(), projectId, input)
    @DeleteMapping("/api/projects/{projectId}/saved-views/{id}")
    fun delete(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long) = service.delete(request.userId(), projectId, id)
}
