package io.arcapp.backend.issue.internal

data class IssueInput(
    val title: String, val type: String, val description: String? = null,
    val status: String = "TODO", val priority: String = "NORMAL", val assigneeId: Long? = null,
    val startDate: String? = null, val dueDate: String? = null, val progress: Int = 0,
    val storyPoints: Int? = null, val parentId: Long? = null, val versionId: Long? = null,
    val customFields: Map<String, Any?>? = null, val fieldRevision: Long? = null,
)
data class IssueEdit(
    val title: String, val type: String, val description: String? = null,
    val status: String, val priority: String? = null, val assigneeId: Long? = null,
    val startDate: String? = null, val dueDate: String? = null, val progress: Int = 0,
    val storyPoints: Int? = null, val parentId: Long? = null, val versionId: Long? = null,
    val version: Long,
    val customFields: Map<String, Any?>? = null, val fieldRevision: Long? = null,
) {
    fun fields() = IssueInput(title, type, description, status, priority ?: "NORMAL", assigneeId, startDate, dueDate, progress, storyPoints, parentId, versionId, customFields, fieldRevision)
}
data class StatusInput(val status: String, val version: Long)
data class ExecutionInput(val status: String, val progress: Int, val version: Long)
data class RelationInput(val targetId: Long, val type: String)
data class CommentInput(val body: String)
data class IssueSearch(
    val search: String?, val status: String?, val type: String?, val assigneeId: Long?,
    val priority: String?, val versionId: Long?, val sprintId: Long?, val sprintState: String?,
    val sort: String, val direction: String, val page: Int, val size: Int,
)
