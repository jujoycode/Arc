package io.arcapp.backend

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.sql.Date

data class IssueInput(
    val title: String, val type: String, val description: String? = null,
    val status: String = "TODO", val priority: String = "NORMAL", val assigneeId: Long? = null,
    val startDate: String? = null, val dueDate: String? = null, val progress: Int = 0,
    val storyPoints: Int? = null, val parentId: Long? = null, val versionId: Long? = null,
)
data class IssueEdit(
    val title: String, val type: String, val description: String? = null,
    val status: String, val priority: String, val assigneeId: Long? = null,
    val startDate: String? = null, val dueDate: String? = null, val progress: Int = 0,
    val storyPoints: Int? = null, val parentId: Long? = null, val versionId: Long? = null,
    val version: Long,
)
data class StatusInput(val status: String, val version: Long)
data class RelationInput(val targetId: Long, val type: String)
data class CommentInput(val body: String)

@RestController
class IssueApi(private val jdbc: JdbcTemplate) {
    private val issueSelect = "SELECT i.id,i.project_id AS projectId,CONCAT(p.project_key,'-',i.issue_number) AS `key`,i.issue_number AS number,i.title,i.description,i.issue_type AS type,i.status,i.priority,i.reporter_id AS reporterId,i.assignee_id AS assigneeId,u.display_name AS assigneeName,i.start_date AS startDate,i.due_date AS dueDate,i.done_ratio AS progress,i.story_points AS storyPoints,i.parent_issue_id AS parentId,i.version_id AS versionId,i.sprint_id AS sprintId,i.sort_order AS sortOrder,i.version,i.created_at AS createdAt,i.updated_at AS updatedAt FROM issues i JOIN projects p ON p.id=i.project_id LEFT JOIN users u ON u.id=i.assignee_id WHERE i.deleted_at IS NULL"

    @GetMapping("/api/projects/{projectId}/issues")
    fun list(
        request: HttpServletRequest, @PathVariable projectId: Long,
        @RequestParam(required = false) search: String?, @RequestParam(required = false) status: String?,
        @RequestParam(required = false) type: String?, @RequestParam(required = false) assigneeId: Long?,
        @RequestParam(required = false) priority: String?, @RequestParam(required = false) versionId: Long?,
        @RequestParam(required = false) sprintId: Long?, @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "100") size: Int,
    ): Map<String, Any> {
        projectRow(jdbc, projectId, request.userId())
        val clauses = mutableListOf("i.project_id=?")
        val args = mutableListOf<Any>(projectId)
        if (!search.isNullOrBlank()) { clauses += "(LOWER(i.title) LIKE ? OR LOWER(CONCAT(p.project_key,'-',i.issue_number)) LIKE ?)"; args += "%${search.lowercase()}%"; args += "%${search.lowercase()}%" }
        if (!status.isNullOrBlank()) { clauses += "i.status=?"; args += status }
        if (!type.isNullOrBlank()) { clauses += "i.issue_type=?"; args += type }
        if (assigneeId != null) { clauses += "i.assignee_id=?"; args += assigneeId }
        if (!priority.isNullOrBlank()) { clauses += "i.priority=?"; args += priority }
        if (versionId != null) { clauses += "i.version_id=?"; args += versionId }
        if (sprintId != null) { clauses += "i.sprint_id=?"; args += sprintId }
        val where = clauses.joinToString(" AND ")
        val count = jdbc.queryForObject("SELECT COUNT(*) FROM issues i JOIN projects p ON p.id=i.project_id WHERE i.deleted_at IS NULL AND $where", Long::class.java, *args.toTypedArray()) ?: 0
        val limit = size.coerceIn(1, 1000)
        val offset = page.coerceAtLeast(0) * limit
        val items = jdbc.queryForList("$issueSelect AND $where ORDER BY i.updated_at DESC,i.id DESC LIMIT ? OFFSET ?", *(args + listOf(limit, offset)).toTypedArray())
        return mapOf("items" to items, "total" to count, "page" to page.coerceAtLeast(0), "size" to limit)
    }

    @GetMapping("/api/projects/{projectId}/issues/{id}")
    fun get(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long): Map<String, Any?> {
        projectRow(jdbc, projectId, request.userId())
        return jdbc.one("$issueSelect AND i.project_id=? AND i.id=?", projectId, id)
            ?: throw ApiError(HttpStatus.NOT_FOUND, "이슈가 없습니다.")
    }

    @PostMapping("/api/projects/{projectId}/issues")
    @Transactional
    fun create(request: HttpServletRequest, @PathVariable projectId: Long, @RequestBody input: IssueInput): Map<String, Any> {
        val project = projectRow(jdbc, projectId, request.userId())
        if (project["archived_at"] != null) throw ApiError(HttpStatus.CONFLICT, "보관된 프로젝트입니다.")
        validate(projectId, project.long("workspace_id"), input.title, input.type, input.status, input.priority, input.assigneeId, input.startDate, input.dueDate, input.progress, input.storyPoints, input.parentId, input.versionId, null)
        val number = jdbc.one("SELECT next_issue_number FROM projects WHERE id=? FOR UPDATE", projectId)!!.let { (it["next_issue_number"] as Number).toInt() }
        jdbc.update("UPDATE projects SET next_issue_number=next_issue_number+1 WHERE id=?", projectId)
        val id = jdbc.insert("INSERT INTO issues(project_id,issue_number,title,description,issue_type,status,priority,reporter_id,assignee_id,start_date,due_date,done_ratio,story_points,parent_issue_id,version_id,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            projectId, number, input.title.trim(), input.description, input.type, input.status, input.priority, request.userId(), input.assigneeId, input.startDate?.let(Date::valueOf), input.dueDate?.let(Date::valueOf), input.progress, input.storyPoints, input.parentId, input.versionId, number)
        activity(id, request.userId(), "CREATED")
        return mapOf("id" to id, "key" to "${project["project_key"]}-$number")
    }

    @PutMapping("/api/projects/{projectId}/issues/{id}")
    @Transactional
    fun update(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long, @RequestBody input: IssueEdit): Map<String, Any> {
        val project = projectRow(jdbc, projectId, request.userId())
        val old = issue(projectId, id)
        if (project["archived_at"] != null) throw ApiError(HttpStatus.CONFLICT, "보관된 프로젝트입니다.")
        validate(projectId, project.long("workspace_id"), input.title, input.type, input.status, input.priority, input.assigneeId, input.startDate, input.dueDate, input.progress, input.storyPoints, input.parentId, input.versionId, id)
        if (old.long("version") != input.version) throw ApiError(HttpStatus.CONFLICT, "다른 사용자가 이슈를 변경했습니다. 새로고침해 주세요.")
        val updated = jdbc.update("UPDATE issues SET title=?,description=?,issue_type=?,status=?,priority=?,assignee_id=?,start_date=?,due_date=?,done_ratio=?,story_points=?,parent_issue_id=?,version_id=?,version=version+1 WHERE id=? AND project_id=? AND version=?",
            input.title.trim(), input.description, input.type, input.status, input.priority, input.assigneeId, input.startDate?.let(Date::valueOf), input.dueDate?.let(Date::valueOf), input.progress, input.storyPoints, input.parentId, input.versionId, id, projectId, input.version)
        if (updated == 0) throw ApiError(HttpStatus.CONFLICT, "다른 사용자가 이슈를 변경했습니다. 새로고침해 주세요.")
        activity(id, request.userId(), "UPDATED")
        return mapOf("version" to input.version + 1)
    }

    @PatchMapping("/api/projects/{projectId}/issues/{id}/status")
    @Transactional
    fun status(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long, @RequestBody input: StatusInput): Map<String, Any> {
        val project = projectRow(jdbc, projectId, request.userId())
        if (project["archived_at"] != null) throw ApiError(HttpStatus.CONFLICT, "보관된 프로젝트입니다.")
        issue(projectId, id)
        if (input.status !in setOf("TODO", "IN_PROGRESS", "REVIEW", "DONE")) throw ApiError(HttpStatus.BAD_REQUEST, "상태가 올바르지 않습니다.")
        val changed = jdbc.update("UPDATE issues SET status=?,version=version+1 WHERE id=? AND project_id=? AND version=? AND deleted_at IS NULL", input.status, id, projectId, input.version)
        if (changed == 0) throw ApiError(HttpStatus.CONFLICT, "다른 사용자가 이슈를 변경했습니다. 새로고침해 주세요.")
        activity(id, request.userId(), "STATUS_CHANGED")
        return mapOf("version" to input.version + 1)
    }

    @DeleteMapping("/api/projects/{projectId}/issues/{id}")
    @Transactional
    fun delete(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long) {
        val project = projectRow(jdbc, projectId, request.userId())
        requireManager(jdbc, project.long("workspace_id"), request.userId())
        issue(projectId, id)
        if (jdbc.one("SELECT 1 FROM issues WHERE parent_issue_id=? AND deleted_at IS NULL LIMIT 1", id) != null)
            throw ApiError(HttpStatus.CONFLICT, "하위 이슈를 먼저 이동하거나 삭제해 주세요.")
        jdbc.update("UPDATE issues SET deleted_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=?", id)
        activity(id, request.userId(), "DELETED")
    }

    @GetMapping("/api/projects/{projectId}/relations")
    fun relations(request: HttpServletRequest, @PathVariable projectId: Long): List<Map<String, Any?>> {
        projectRow(jdbc, projectId, request.userId())
        return jdbc.queryForList("SELECT r.id,r.source_issue_id AS fromId,r.target_issue_id AS toId,r.relation_type AS type,r.lag_days AS lagDays FROM issue_relations r JOIN issues a ON a.id=r.source_issue_id JOIN issues b ON b.id=r.target_issue_id WHERE r.project_id=? AND a.deleted_at IS NULL AND b.deleted_at IS NULL", projectId)
    }

    @PostMapping("/api/projects/{projectId}/issues/{id}/relations")
    @Transactional
    fun addRelation(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long, @RequestBody input: RelationInput): Map<String, Long> {
        projectRow(jdbc, projectId, request.userId())
        issue(projectId, id); issue(projectId, input.targetId)
        if (id == input.targetId || input.type !in setOf("BLOCKS", "PRECEDES")) throw ApiError(HttpStatus.BAD_REQUEST, "관계가 올바르지 않습니다.")
        val edges = jdbc.queryForList("SELECT source_issue_id,target_issue_id FROM issue_relations WHERE project_id=?", projectId)
        val seen = mutableSetOf<Long>()
        fun reaches(current: Long): Boolean {
            if (current == id) return true
            if (!seen.add(current)) return false
            return edges.filter { (it["source_issue_id"] as Number).toLong() == current }.any { reaches((it["target_issue_id"] as Number).toLong()) }
        }
        if (reaches(input.targetId)) throw ApiError(HttpStatus.BAD_REQUEST, "관계에 순환이 생깁니다.")
        val relationId = jdbc.insert("INSERT INTO issue_relations(project_id,source_issue_id,target_issue_id,relation_type) VALUES(?,?,?,?)", projectId, id, input.targetId, input.type)
        activity(id, request.userId(), "RELATION_ADDED")
        return mapOf("id" to relationId)
    }

    @DeleteMapping("/api/projects/{projectId}/relations/{relationId}")
    fun deleteRelation(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable relationId: Long) {
        projectRow(jdbc, projectId, request.userId())
        jdbc.update("DELETE FROM issue_relations WHERE id=? AND project_id=?", relationId, projectId)
    }

    @GetMapping("/api/projects/{projectId}/issues/{id}/comments")
    fun comments(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long): List<Map<String, Any?>> {
        projectRow(jdbc, projectId, request.userId()); issue(projectId, id)
        return jdbc.queryForList("SELECT c.id,c.body,c.author_id AS authorId,u.display_name AS authorName,c.created_at AS createdAt,c.updated_at AS updatedAt FROM comments c JOIN users u ON u.id=c.author_id WHERE c.issue_id=? AND c.deleted_at IS NULL ORDER BY c.created_at", id)
    }

    @PostMapping("/api/projects/{projectId}/issues/{id}/comments")
    fun addComment(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long, @RequestBody input: CommentInput): Map<String, Long> {
        projectRow(jdbc, projectId, request.userId()); issue(projectId, id)
        if (input.body.isBlank()) throw ApiError(HttpStatus.BAD_REQUEST, "댓글을 입력해 주세요.")
        return mapOf("id" to jdbc.insert("INSERT INTO comments(issue_id,author_id,body) VALUES(?,?,?)", id, request.userId(), input.body.trim()))
    }

    @PutMapping("/api/projects/{projectId}/comments/{commentId}")
    fun editComment(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable commentId: Long, @RequestBody input: CommentInput) {
        val project = projectRow(jdbc, projectId, request.userId())
        val comment = comment(projectId, commentId)
        if (comment.long("author_id") != request.userId()) throw ApiError(HttpStatus.FORBIDDEN, "본인 댓글만 수정할 수 있습니다.")
        if (input.body.isBlank()) throw ApiError(HttpStatus.BAD_REQUEST, "댓글을 입력해 주세요.")
        jdbc.update("UPDATE comments SET body=? WHERE id=?", input.body.trim(), commentId)
    }

    @DeleteMapping("/api/projects/{projectId}/comments/{commentId}")
    fun deleteComment(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable commentId: Long) {
        val project = projectRow(jdbc, projectId, request.userId())
        val comment = comment(projectId, commentId)
        if (comment.long("author_id") != request.userId()) requireManager(jdbc, project.long("workspace_id"), request.userId())
        jdbc.update("UPDATE comments SET deleted_at=UTC_TIMESTAMP(6) WHERE id=?", commentId)
    }

    @GetMapping("/api/projects/{projectId}/issues/{id}/activities")
    fun activities(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long): List<Map<String, Any?>> {
        projectRow(jdbc, projectId, request.userId()); issue(projectId, id)
        return jdbc.queryForList("SELECT a.id,a.event_type AS type,u.display_name AS actorName,a.created_at AS createdAt FROM issue_activities a JOIN users u ON u.id=a.actor_id WHERE a.issue_id=? ORDER BY a.id DESC", id)
    }

    private fun issue(projectId: Long, id: Long): Map<String, Any?> = jdbc.one("SELECT * FROM issues WHERE id=? AND project_id=? AND deleted_at IS NULL", id, projectId)
        ?: throw ApiError(HttpStatus.NOT_FOUND, "이슈가 없습니다.")

    private fun comment(projectId: Long, id: Long): Map<String, Any?> = jdbc.one("SELECT c.* FROM comments c JOIN issues i ON i.id=c.issue_id WHERE c.id=? AND i.project_id=? AND c.deleted_at IS NULL", id, projectId)
        ?: throw ApiError(HttpStatus.NOT_FOUND, "댓글이 없습니다.")

    private fun activity(issueId: Long, actorId: Long, event: String) {
        jdbc.update("INSERT INTO issue_activities(issue_id,actor_id,event_type) VALUES(?,?,?)", issueId, actorId, event)
    }

    private fun validate(projectId: Long, workspaceId: Long, title: String, type: String, status: String, priority: String, assigneeId: Long?, startDate: String?, dueDate: String?, progress: Int, points: Int?, parentId: Long?, versionId: Long?, ownId: Long?) {
        if (title.isBlank() || title.length > 200 || type !in setOf("EPIC", "STORY", "TASK", "BUG", "SUBTASK") || status !in setOf("TODO", "IN_PROGRESS", "REVIEW", "DONE") || priority !in setOf("LOW", "NORMAL", "HIGH", "URGENT") || progress !in 0..100 || points != null && points < 0)
            throw ApiError(HttpStatus.BAD_REQUEST, "이슈 입력값이 올바르지 않습니다.")
        try { startDate?.let(Date::valueOf); dueDate?.let(Date::valueOf) } catch (_: IllegalArgumentException) { throw ApiError(HttpStatus.BAD_REQUEST, "날짜 형식이 올바르지 않습니다.") }
        if (startDate != null && dueDate != null && startDate > dueDate) throw ApiError(HttpStatus.BAD_REQUEST, "시작일이 완료일보다 늦습니다.")
        if (assigneeId != null && jdbc.one("SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=?", workspaceId, assigneeId) == null)
            throw ApiError(HttpStatus.BAD_REQUEST, "담당자는 팀 멤버여야 합니다.")
        if (versionId != null && jdbc.one("SELECT 1 FROM versions WHERE id=? AND project_id=?", versionId, projectId) == null)
            throw ApiError(HttpStatus.BAD_REQUEST, "버전이 프로젝트에 속하지 않습니다.")
        if (type == "EPIC" && parentId != null || type == "SUBTASK" && parentId == null)
            throw ApiError(HttpStatus.BAD_REQUEST, "이슈 계층이 올바르지 않습니다.")
        if (ownId != null) {
            val childTypes = jdbc.queryForList("SELECT issue_type FROM issues WHERE parent_issue_id=? AND deleted_at IS NULL", ownId)
                .map { it["issue_type"] as String }
            val allowedChildren = when (type) {
                "EPIC" -> setOf("STORY", "TASK", "BUG")
                "STORY", "TASK", "BUG" -> setOf("SUBTASK")
                else -> emptySet()
            }
            if (childTypes.any { it !in allowedChildren })
                throw ApiError(HttpStatus.BAD_REQUEST, "하위 이슈와 유형이 맞지 않습니다. 하위 이슈를 먼저 이동해 주세요.")
        }
        if (parentId != null) {
            val parent = issue(projectId, parentId)
            val parentType = parent["issue_type"] as String
            if (type == "SUBTASK" && parentType !in setOf("STORY", "TASK", "BUG") || type != "SUBTASK" && parentType != "EPIC")
                throw ApiError(HttpStatus.BAD_REQUEST, "부모 이슈 유형이 올바르지 않습니다.")
            var current: Long? = parentId
            val seen = mutableSetOf<Long>()
            while (current != null) {
                if (current == ownId || !seen.add(current)) throw ApiError(HttpStatus.BAD_REQUEST, "이슈 계층에 순환이 생깁니다.")
                current = (issue(projectId, current)["parent_issue_id"] as? Number)?.toLong()
            }
        }
    }
}
