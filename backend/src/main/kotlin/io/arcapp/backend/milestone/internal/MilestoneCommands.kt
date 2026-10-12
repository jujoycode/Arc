package io.arcapp.backend.milestone.internal

import io.arcapp.backend.milestone.api.*
import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.shared.api.calendarDate
import org.springframework.http.HttpStatus

private fun invalid(field: String, message: String): Nothing =
    throw ApiError(HttpStatus.BAD_REQUEST, message, "VALIDATION_FAILED", mapOf(field to message))
private fun required(value: String?, field: String, max: Int): String {
    val normalized = value?.trim()
    if (normalized.isNullOrEmpty() || normalized.length > max) invalid(field, "1~${max}자로 입력해 주세요.")
    return normalized
}
fun validateMetadata(input: MilestoneInput): MilestoneInput {
    val title = required(input.title, "title", 120)
    val criteria = required(input.criteria, "criteria", 10000)
    val date = input.targetDate ?: invalid("targetDate", "목표일을 입력해 주세요.")
    calendarDate(date, "targetDate")
    if ((input.description?.length ?: 0) > 10000) invalid("description", "10,000자 이하로 입력해 주세요.")
    return input.copy(title = title, criteria = criteria, targetDate = date)
}
fun validateRevision(revision: Long?): Long {
    if (revision == null || revision < 0) invalid("revision", "현재 revision을 0 이상의 정수로 입력해 주세요.")
    return revision
}
fun validateReason(reason: String?, required: Boolean): String? {
    if ((reason?.length ?: 0) > 1000) invalid("reason", "1,000자 이하로 입력해 주세요.")
    val normalized = reason?.trim()?.takeIf { it.isNotEmpty() }
    if (required && normalized == null) invalid("reason", "변경 사유를 입력해 주세요.")
    return normalized
}
fun requireMilestoneRevision(snapshot: MilestoneSnapshot, revision: Long) {
    if (snapshot.revision != revision) throw ApiError(HttpStatus.CONFLICT,
        "마일스톤이 변경되었습니다. 최신 내용을 확인해 주세요.", "MILESTONE_CHANGED")
}
fun requireMilestoneState(snapshot: MilestoneSnapshot, expected: MilestoneStatus) {
    if (snapshot.status != expected) throw ApiError(HttpStatus.CONFLICT, "현재 마일스톤 상태에서 허용되지 않는 변경입니다.")
}
/** Fixed schema checked at both persistence boundaries, never arbitrary request JSON. */
fun validateHistory(type: MilestoneEvent, payload: MilestoneHistoryPayload) {
    require(payload.schemaVersion == 1 && payload.revision == payload.after.revision)
    fun snapshot(value: MilestoneSnapshot) {
        val input = MilestoneInput(value.title, value.targetDate, value.criteria, value.description, value.ownerId, value.versionId)
        require(validateMetadata(input) == input && value.revision >= 0)
        require(value.status != MilestoneStatus.ACHIEVED)
    }
    snapshot(payload.after)
    payload.before?.let { snapshot(it) }
    require(validateReason(payload.reason, type in setOf(MilestoneEvent.CANCELLED, MilestoneEvent.REOPENED)) == payload.reason)
    if (type == MilestoneEvent.CREATED) {
        require(payload.before == null && payload.previousRevision == null && payload.revision == 0L && payload.reason == null)
        require(payload.after.status == MilestoneStatus.PLANNED)
    } else {
        val before = requireNotNull(payload.before)
        require(payload.previousRevision == before.revision && before.revision < Long.MAX_VALUE && payload.revision == before.revision + 1)
        when (type) {
            MilestoneEvent.UPDATED -> {
                require(before.status == MilestoneStatus.PLANNED && payload.after.status == MilestoneStatus.PLANNED)
                if (before.targetDate != payload.after.targetDate) validateReason(payload.reason, true)
            }
            MilestoneEvent.CANCELLED, MilestoneEvent.REOPENED -> {
                val old = if (type == MilestoneEvent.CANCELLED) MilestoneStatus.PLANNED else MilestoneStatus.CANCELLED
                val next = if (type == MilestoneEvent.CANCELLED) MilestoneStatus.CANCELLED else MilestoneStatus.PLANNED
                require(before.status == old && payload.after == before.copy(status = next, revision = payload.revision))
            }
            MilestoneEvent.CREATED -> error("Already validated")
        }
    }
}
