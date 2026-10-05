package io.arcapp.backend.issue.web

import io.arcapp.backend.issue.internal.*
import io.arcapp.backend.shared.web.userId
import jakarta.servlet.http.HttpServletRequest
import org.springframework.web.bind.annotation.*

@RestController
class IssueController(private val service: IssueService, private val queries: IssueQueryService) {
    @GetMapping("/api/projects/{projectId}/issues")
    fun list(
        request: HttpServletRequest, @PathVariable projectId: Long,
        @RequestParam(required = false) search: String?, @RequestParam(required = false) status: String?,
        @RequestParam(required = false) type: String?, @RequestParam(required = false) assigneeId: Long?,
        @RequestParam(required = false) priority: String?, @RequestParam(required = false) versionId: Long?,
        @RequestParam(required = false) sprintId: Long?, @RequestParam(required = false) sprintState: String?,
        @RequestParam(defaultValue = "updatedAt") sort: String, @RequestParam(defaultValue = "desc") direction: String,
        @RequestParam(defaultValue = "0") page: Int, @RequestParam(defaultValue = "100") size: Int,
    ) = queries.list(request.userId(), projectId, IssueSearch(search, status, type, assigneeId, priority, versionId, sprintId, sprintState, sort, direction, page, size))

    @GetMapping("/api/projects/{projectId}/issues/{id}")
    fun get(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long) = queries.get(request.userId(), projectId, id)
    @PostMapping("/api/projects/{projectId}/issues")
    fun create(request: HttpServletRequest, @PathVariable projectId: Long, @RequestBody input: IssueInput) = service.create(request.userId(), projectId, input)
    @PutMapping("/api/projects/{projectId}/issues/{id}")
    fun update(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long, @RequestBody input: IssueEdit) = service.update(request.userId(), projectId, id, input)
    @PatchMapping("/api/projects/{projectId}/issues/{id}/status")
    fun status(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long, @RequestBody input: StatusInput) = service.status(request.userId(), projectId, id, input)
    @DeleteMapping("/api/projects/{projectId}/issues/{id}")
    fun delete(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long) = service.delete(request.userId(), projectId, id)
    @GetMapping("/api/projects/{projectId}/relations")
    fun relations(request: HttpServletRequest, @PathVariable projectId: Long) = queries.relations(request.userId(), projectId)
    @PostMapping("/api/projects/{projectId}/issues/{id}/relations")
    fun addRelation(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long, @RequestBody input: RelationInput) = service.addRelation(request.userId(), projectId, id, input)
    @DeleteMapping("/api/projects/{projectId}/relations/{relationId}")
    fun deleteRelation(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable relationId: Long) = service.deleteRelation(request.userId(), projectId, relationId)
    @GetMapping("/api/projects/{projectId}/issues/{id}/comments")
    fun comments(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long) = queries.comments(request.userId(), projectId, id)
    @PostMapping("/api/projects/{projectId}/issues/{id}/comments")
    fun addComment(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long, @RequestBody input: CommentInput) = service.addComment(request.userId(), projectId, id, input)
    @PutMapping("/api/projects/{projectId}/comments/{commentId}")
    fun editComment(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable commentId: Long, @RequestBody input: CommentInput) = service.editComment(request.userId(), projectId, commentId, input)
    @DeleteMapping("/api/projects/{projectId}/comments/{commentId}")
    fun deleteComment(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable commentId: Long) = service.deleteComment(request.userId(), projectId, commentId)
    @GetMapping("/api/projects/{projectId}/issues/{id}/activities")
    fun activities(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long) = queries.activities(request.userId(), projectId, id)
}
