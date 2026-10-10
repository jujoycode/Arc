package io.arcapp.backend.ticketfield.api

data class StandardTicketField(
    val key: String, val label: String, val description: String = "",
    val visible: Boolean = true, val required: Boolean = false, val order: Int,
)

data class TicketFieldOption(val value: String, val label: String, val active: Boolean = true)

data class CustomTicketField(
    val key: String, val type: String, val label: String, val description: String = "",
    val active: Boolean = true, val required: Boolean = false, val order: Int,
    val options: List<TicketFieldOption> = emptyList(),
)

data class TicketFieldPolicy(
    val workspaceId: Long, val revision: Long,
    val standardFields: List<StandardTicketField>, val customFields: List<CustomTicketField>,
)

fun defaultTicketFieldPolicy(workspaceId: Long) = TicketFieldPolicy(workspaceId, 0, listOf(
    StandardTicketField("title", "제목", required = true, order = 0),
    StandardTicketField("description", "설명", order = 1),
    StandardTicketField("type", "유형", required = true, order = 0),
    StandardTicketField("priority", "우선순위", order = 1),
    StandardTicketField("assigneeId", "담당자", order = 2),
    StandardTicketField("parentId", "부모 이슈", order = 3),
    StandardTicketField("versionId", "버전", order = 4),
    StandardTicketField("startDate", "시작일", order = 0),
    StandardTicketField("dueDate", "완료일", order = 1),
    StandardTicketField("storyPoints", "스토리 포인트", order = 2),
    StandardTicketField("status", "상태", required = true, order = 0),
    StandardTicketField("progress", "완료율", required = true, order = 1),
), emptyList())
