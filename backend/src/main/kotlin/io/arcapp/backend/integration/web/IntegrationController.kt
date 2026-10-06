package io.arcapp.backend.integration.web

import io.arcapp.backend.integration.internal.ConnectionInput
import io.arcapp.backend.integration.internal.IntegrationService
import io.arcapp.backend.shared.web.userId
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*

@RestController
internal class IntegrationController(private val service: IntegrationService) {
    @GetMapping("/api/projects/{projectId}/repository-connections")
    fun list(request: HttpServletRequest, @PathVariable projectId: Long) = service.list(request.userId(), projectId)
    @PostMapping("/api/projects/{projectId}/repository-connections")
    fun connect(request: HttpServletRequest, @PathVariable projectId: Long, @RequestBody input: ConnectionInput) = service.connect(request.userId(), projectId, input)
    @PostMapping("/api/projects/{projectId}/repository-connections/{id}/check")
    fun check(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long) = service.recheck(request.userId(), projectId, id)
    @DeleteMapping("/api/projects/{projectId}/repository-connections/{id}")
    fun disconnect(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long) = service.disconnect(request.userId(), projectId, id)
    @GetMapping("/api/projects/{projectId}/repository-connections/{id}/deliveries")
    fun deliveries(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long) = service.deliveries(request.userId(), projectId, id)
    @PostMapping("/api/projects/{projectId}/repository-connections/{id}/deliveries/{deliveryId}/retry")
    fun retry(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long, @PathVariable deliveryId: Long) = service.retry(request.userId(), projectId, id, deliveryId)
    @GetMapping("/api/projects/{projectId}/issues/{issueId}/development-links")
    fun links(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable issueId: Long) = service.links(request.userId(), projectId, issueId)
    @PostMapping("/api/integrations/webhooks/{id}")
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun webhook(request: HttpServletRequest, @PathVariable id: Long): Map<String, Boolean> {
        val connectionHeaders = if (request.getHeader("X-GitHub-Event") != null) mapOf(
            "event" to request.getHeader("X-GitHub-Event").orEmpty(), "delivery" to request.getHeader("X-GitHub-Delivery").orEmpty(), "signature" to request.getHeader("X-Hub-Signature-256").orEmpty(),
        ) else mapOf("event" to request.getHeader("X-Gitlab-Event").orEmpty(), "delivery" to request.getHeader("X-Gitlab-Event-UUID").orEmpty(), "token" to request.getHeader("X-Gitlab-Token").orEmpty())
        return service.receive(id, connectionHeaders, request.inputStream.readNBytes(1048577))
    }
}
