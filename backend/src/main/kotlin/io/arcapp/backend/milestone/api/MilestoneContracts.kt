package io.arcapp.backend.milestone.api

enum class MilestoneStatus { PLANNED, ACHIEVED, CANCELLED }
enum class MilestoneEvent { CREATED, UPDATED, CANCELLED, REOPENED }
/** PUT replaces all metadata; absent or null optional fields clear their values. */
data class MilestoneInput(val title: String? = null, val targetDate: String? = null, val criteria: String? = null,
    val description: String? = null, val ownerId: Long? = null, val versionId: Long? = null)
data class MilestoneEdit(val title: String? = null, val targetDate: String? = null, val criteria: String? = null,
    val description: String? = null, val ownerId: Long? = null, val versionId: Long? = null,
    val revision: Long? = null, val reason: String? = null) {
    fun metadata() = MilestoneInput(title, targetDate, criteria, description, ownerId, versionId)
}
data class MilestoneTransition(val revision: Long? = null, val reason: String? = null)
data class MilestoneSnapshot(val title: String, val targetDate: String, val criteria: String, val description: String?,
    val ownerId: Long?, val versionId: Long?, val status: MilestoneStatus, val revision: Long)
data class MilestoneDetail(val id: Long, val projectId: Long, val title: String, val targetDate: String,
    val criteria: String, val description: String?, val ownerId: Long?, val versionId: Long?,
    val status: MilestoneStatus, val revision: Long, val createdAt: String, val updatedAt: String) {
    fun snapshot() = MilestoneSnapshot(title, targetDate, criteria, description, ownerId, versionId, status, revision)
}
data class MilestoneHistoryPayload(val schemaVersion: Int = 1, val previousRevision: Long?, val revision: Long,
    val reason: String?, val before: MilestoneSnapshot?, val after: MilestoneSnapshot)
data class MilestoneActivity(val id: Long, val type: MilestoneEvent, val actorId: Long, val actorName: String,
    val createdAt: String, val payload: MilestoneHistoryPayload)
data class MilestonePage<T>(val items: List<T>, val total: Long, val page: Int, val size: Int)
