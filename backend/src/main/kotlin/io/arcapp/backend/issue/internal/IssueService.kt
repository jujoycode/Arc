package io.arcapp.backend.issue.internal

import io.arcapp.backend.issue.internal.persistence.IssueRepository
import io.arcapp.backend.project.api.ProjectAccess
import io.arcapp.backend.project.api.ProjectContext
import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.shared.persistence.long
import io.arcapp.backend.workspace.api.WorkspaceAccess
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Date

@Service
class IssueService(private val repository: IssueRepository, private val projects: ProjectAccess, private val workspaces: WorkspaceAccess) {
    @Transactional
    fun create(actorId: Long, projectId: Long, input: IssueInput): Map<String, Any> {
        val project = managedProject(actorId, projectId)
        validate(project, input, null)
        val number = projects.allocateIssueNumber(project)
        val id = repository.create(projectId, number.number, actorId, input)
        repository.activity(id, actorId, "CREATED")
        return mapOf("id" to id, "key" to "${number.key}-${number.number}")
    }

    @Transactional
    fun update(actorId: Long, projectId: Long, id: Long, input: IssueEdit): Map<String, Any> {
        val project = managedProject(actorId, projectId)
        val old = issue(projectId, id)
        validate(project, input.fields(), id)
        if (old.long("version") != input.version || repository.update(projectId, id, input.fields(), input.version) == 0) conflict()
        repository.activity(id, actorId, "UPDATED")
        return mapOf("version" to input.version + 1)
    }

    @Transactional
    fun status(actorId: Long, projectId: Long, id: Long, input: StatusInput): Map<String, Any> {
        val project = activeProject(actorId, projectId)
        requireExecutor(project, actorId, issue(projectId, id))
        if (input.status !in setOf("TODO", "IN_PROGRESS", "REVIEW", "DONE")) throw ApiError(HttpStatus.BAD_REQUEST, "상태가 올바르지 않습니다.")
        if (repository.status(projectId, id, input.status, input.version) == 0) conflict()
        repository.activity(id, actorId, "STATUS_CHANGED")
        return mapOf("version" to input.version + 1)
    }

    @Transactional
    fun execution(actorId: Long, projectId: Long, id: Long, input: ExecutionInput): Map<String, Any> {
        val project = activeProject(actorId, projectId)
        requireExecutor(project, actorId, issue(projectId, id))
        if (input.status !in setOf("TODO", "IN_PROGRESS", "REVIEW", "DONE") || input.progress !in 0..100)
            throw ApiError(HttpStatus.BAD_REQUEST, "상태와 완료율을 확인해 주세요.")
        if (repository.execution(projectId, id, input, input.version) == 0) conflict()
        repository.activity(id, actorId, "EXECUTION_UPDATED")
        return mapOf("version" to input.version + 1)
    }

    @Transactional
    fun delete(actorId: Long, projectId: Long, id: Long) {
        val project = activeProject(actorId, projectId)
        projects.requireManager(project, actorId)
        issue(projectId, id)
        if (repository.childTypes(id).isNotEmpty()) throw ApiError(HttpStatus.CONFLICT, "하위 이슈를 먼저 이동하거나 삭제해 주세요.")
        repository.delete(id)
        repository.activity(id, actorId, "DELETED")
    }

    @Transactional
    fun addRelation(actorId: Long, projectId: Long, id: Long, input: RelationInput): Map<String, Long> {
        managedProject(actorId, projectId)
        issue(projectId, id); issue(projectId, input.targetId)
        if (id == input.targetId || input.type !in setOf("BLOCKS", "PRECEDES")) throw ApiError(HttpStatus.BAD_REQUEST, "관계가 올바르지 않습니다.")
        val edges = repository.relations(setOf(projectId))
        val seen = mutableSetOf<Long>()
        fun reaches(current: Long): Boolean {
            if (current == id) return true
            if (!seen.add(current)) return false
            return edges.filter { it.long("fromId") == current }.any { reaches(it.long("toId")) }
        }
        if (reaches(input.targetId)) throw ApiError(HttpStatus.BAD_REQUEST, "관계에 순환이 생깁니다.")
        val relationId = repository.createRelation(projectId, id, input.targetId, input.type)
        repository.activity(id, actorId, "RELATION_ADDED")
        return mapOf("id" to relationId)
    }

    @Transactional
    fun deleteRelation(actorId: Long, projectId: Long, relationId: Long) { managedProject(actorId, projectId); repository.deleteRelation(projectId, relationId) }

    @Transactional
    fun addComment(actorId: Long, projectId: Long, id: Long, input: CommentInput): Map<String, Long> {
        activeProject(actorId, projectId); issue(projectId, id)
        requireBody(input.body)
        return mapOf("id" to repository.addComment(id, actorId, input.body.trim()))
    }

    @Transactional
    fun editComment(actorId: Long, projectId: Long, commentId: Long, input: CommentInput) {
        activeProject(actorId, projectId)
        val comment = comment(projectId, commentId)
        if (comment.long("author_id") != actorId) throw ApiError(HttpStatus.FORBIDDEN, "본인 댓글만 수정할 수 있습니다.")
        requireBody(input.body)
        repository.editComment(commentId, input.body.trim())
    }

    @Transactional
    fun deleteComment(actorId: Long, projectId: Long, commentId: Long) {
        val project = activeProject(actorId, projectId)
        val comment = comment(projectId, commentId)
        if (comment.long("author_id") != actorId) projects.requireManager(project, actorId)
        repository.deleteComment(commentId)
    }

    private fun activeProject(actorId: Long, projectId: Long): ProjectContext = projects.forUpdate(projectId, actorId).also { it.requireActive() }
    private fun managedProject(actorId: Long, projectId: Long): ProjectContext = activeProject(actorId, projectId).also { projects.requireManager(it, actorId) }
    private fun requireExecutor(project: ProjectContext, actorId: Long, ticket: Map<String, Any?>) {
        if (!projects.isManager(project, actorId) && (ticket["assignee_id"] as? Number)?.toLong() != actorId)
            throw ApiError(HttpStatus.FORBIDDEN, "본인에게 배정된 티켓의 상태와 완료율만 수정할 수 있습니다.")
    }
    private fun issue(projectId: Long, id: Long): Map<String, Any?> = repository.find(projectId, id) ?: throw ApiError(HttpStatus.NOT_FOUND, "이슈가 없습니다.")
    private fun comment(projectId: Long, id: Long): Map<String, Any?> = repository.comment(projectId, id) ?: throw ApiError(HttpStatus.NOT_FOUND, "댓글이 없습니다.")
    private fun requireBody(body: String) { if (body.isBlank()) throw ApiError(HttpStatus.BAD_REQUEST, "댓글을 입력해 주세요.") }
    private fun conflict(): Nothing = throw ApiError(HttpStatus.CONFLICT, "다른 사용자가 이슈를 변경했습니다. 새로고침해 주세요.")

    private fun validate(project: ProjectContext, input: IssueInput, ownId: Long?) = with(input) {
        if (title.isBlank() || title.length > 200 || type !in setOf("EPIC", "STORY", "TASK", "BUG", "SUBTASK") || status !in setOf("TODO", "IN_PROGRESS", "REVIEW", "DONE") || priority !in setOf("LOW", "NORMAL", "HIGH", "URGENT") || progress !in 0..100 || storyPoints != null && storyPoints < 0)
            throw ApiError(HttpStatus.BAD_REQUEST, "이슈 입력값이 올바르지 않습니다.")
        try { startDate?.let(Date::valueOf); dueDate?.let(Date::valueOf) } catch (_: IllegalArgumentException) { throw ApiError(HttpStatus.BAD_REQUEST, "날짜 형식이 올바르지 않습니다.") }
        if (startDate != null && dueDate != null && startDate > dueDate) throw ApiError(HttpStatus.BAD_REQUEST, "시작일이 완료일보다 늦습니다.")
        if (assigneeId != null && !workspaces.containsMember(project.workspaceId, assigneeId)) throw ApiError(HttpStatus.BAD_REQUEST, "담당자는 팀 멤버여야 합니다.")
        if (versionId != null && !projects.containsVersion(project.id, versionId)) throw ApiError(HttpStatus.BAD_REQUEST, "버전이 프로젝트에 속하지 않습니다.")
        if (type == "EPIC" && parentId != null || type == "SUBTASK" && parentId == null) throw ApiError(HttpStatus.BAD_REQUEST, "이슈 계층이 올바르지 않습니다.")
        if (ownId != null) {
            val allowed = when (type) { "EPIC" -> setOf("STORY", "TASK", "BUG"); "STORY", "TASK", "BUG" -> setOf("SUBTASK"); else -> emptySet() }
            if (repository.childTypes(ownId).any { it !in allowed }) throw ApiError(HttpStatus.BAD_REQUEST, "하위 이슈와 유형이 맞지 않습니다. 하위 이슈를 먼저 이동해 주세요.")
        }
        if (parentId != null) {
            val parentType = issue(project.id, parentId)["issue_type"] as String
            if (type == "SUBTASK" && parentType !in setOf("STORY", "TASK", "BUG") || type != "SUBTASK" && parentType != "EPIC") throw ApiError(HttpStatus.BAD_REQUEST, "부모 이슈 유형이 올바르지 않습니다.")
            var current: Long? = parentId
            val seen = mutableSetOf<Long>()
            while (current != null) {
                if (current == ownId || !seen.add(current)) throw ApiError(HttpStatus.BAD_REQUEST, "이슈 계층에 순환이 생깁니다.")
                current = (issue(project.id, current)["parent_issue_id"] as? Number)?.toLong()
            }
        }
    }
}
