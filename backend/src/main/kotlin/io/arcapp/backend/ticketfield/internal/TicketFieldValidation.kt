package io.arcapp.backend.ticketfield.internal

import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.ticketfield.api.*
import org.springframework.http.HttpStatus
import java.math.BigDecimal
import java.time.LocalDate
import java.time.format.DateTimeParseException

private val customKey = Regex("^[a-z][a-z0-9_-]{0,63}$")
private val optionKey = Regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")
private val dateKey = Regex("^\\d{4}-\\d{2}-\\d{2}$")
private val fixedFields = setOf("title", "type", "status", "progress")
private val reservedKeys = setOf("constructor", "prototype", "__proto__")

fun validateTicketFieldPolicy(policy: TicketFieldPolicy, previous: TicketFieldPolicy) {
    val errors = linkedMapOf<String, String>()
    val expectedKeys = defaultTicketFieldPolicy(policy.workspaceId).standardFields.map { it.key }.toSet()
    if (policy.standardFields.map { it.key }.toSet() != expectedKeys || policy.standardFields.size != expectedKeys.size)
        errors["standardFields"] = "모든 표준 필드를 중복 없이 포함해 주세요."
    policy.standardFields.forEachIndexed { index, field ->
        val path = "standardFields.$index"
        if (field.label.isBlank() || field.label.length > 80) errors["$path.label"] = "레이블은 1~80자로 입력해 주세요."
        if (field.description.length > 500) errors["$path.description"] = "설명은 500자 이하로 입력해 주세요."
        if (field.order !in 0..1000) errors["$path.order"] = "순서는 0~1000 사이의 정수여야 합니다."
        if (field.key in fixedFields && (!field.visible || !field.required)) errors["$path.required"] = "기본 식별·실행 필드는 항상 표시하고 필수로 유지해야 합니다."
        if (!field.visible && field.required) errors["$path.visible"] = "숨긴 필드는 필수로 지정할 수 없습니다."
        if (field.key == "parentId" && field.required) errors["$path.required"] = "상위 티켓 필수 여부는 티켓 유형에 따라 결정됩니다."
    }
    if (policy.customFields.size > 100) errors["customFields"] = "비활성 필드를 포함하여 최대 100개까지 등록할 수 있습니다."
    if (policy.customFields.count { it.active } > 30) errors["customFields"] = "활성 커스텀 필드는 최대 30개입니다."
    val previousByKey = previous.customFields.associateBy { it.key }
    if (policy.customFields.map { it.key }.toSet().size != policy.customFields.size) errors["customFields"] = "커스텀 필드 키가 중복됩니다."
    if (previousByKey.keys.any { key -> policy.customFields.none { it.key == key } }) errors["customFields"] = "저장된 필드는 제거할 수 없습니다. 비활성화해 주세요."
    policy.customFields.forEachIndexed { index, field ->
        val path = "customFields.$index"
        if (!customKey.matches(field.key) || field.key in reservedKeys || field.key in expectedKeys) errors["$path.key"] = "필드 키는 영문 소문자로 시작하는 1~64자의 영문 소문자·숫자·밑줄·하이픈이어야 합니다."
        if (field.type !in setOf("TEXT", "NUMBER", "DATE", "SELECT")) errors["$path.type"] = "지원하지 않는 필드 유형입니다."
        if (previousByKey[field.key]?.let { it.type != field.type } == true) errors["$path.type"] = "생성한 필드의 유형은 변경할 수 없습니다."
        if (field.label.isBlank() || field.label.length > 80) errors["$path.label"] = "레이블은 1~80자로 입력해 주세요."
        if (field.description.length > 500) errors["$path.description"] = "설명은 500자 이하로 입력해 주세요."
        if (field.order !in 0..1000) errors["$path.order"] = "순서는 0~1000 사이의 정수여야 합니다."
        if (field.options.size > 100 || field.options.map { it.value }.toSet().size != field.options.size) errors["$path.options"] = "선택지는 중복 없이 최대 100개까지 등록할 수 있습니다."
        if (field.type != "SELECT" && field.options.isNotEmpty()) errors["$path.options"] = "단일 선택 필드에만 선택지를 지정할 수 있습니다."
        if (field.type == "SELECT" && field.active && field.options.none { it.active }) errors["$path.options"] = "활성 선택지를 하나 이상 등록해 주세요."
        if (previousByKey[field.key]?.options?.any { old -> field.options.none { it.value == old.value } } == true) errors["$path.options"] = "저장된 선택지는 제거할 수 없습니다. 비활성화해 주세요."
        field.options.forEachIndexed { optionIndex, option ->
            if (!optionKey.matches(option.value) || option.value in reservedKeys) errors["$path.options.$optionIndex.value"] = "선택지 키 형식이 올바르지 않습니다."
            if (option.label.isBlank() || option.label.length > 80) errors["$path.options.$optionIndex.label"] = "선택지 이름은 1~80자로 입력해 주세요."
        }
    }
    failFields(errors, "INVALID_TICKET_FIELDS", "티켓 필드 설정을 확인해 주세요.")
}

/** The supplied map is a patch: omitted keys and disabled fields retain their previous values. */
fun validateTicketFieldValues(
    policy: TicketFieldPolicy, standard: Map<String, Any?>,
    supplied: Map<String, Any?>?, previous: Map<String, Any?>,
): Map<String, Any?> {
    val errors = linkedMapOf<String, String>()
    policy.standardFields.filter { it.visible && it.required }.forEach { field ->
        val value = standard[field.key]
        if (value == null || value is String && value.isBlank()) errors[field.key] = "${field.label}을(를) 입력해 주세요."
    }
    val definitions = policy.customFields.associateBy { it.key }
    if (supplied != null) for (key in supplied.keys) {
        if (key !in definitions) errors["customFields.$key"] = "이 워크스페이스에 등록된 필드가 아닙니다."
    }
    val merged = previous.toMutableMap()
    for (field in policy.customFields) {
        val path = "customFields.${field.key}"
        if (!field.active) continue
        if (supplied?.containsKey(field.key) == true) {
            val raw = supplied[field.key]
            val value = if (raw is String && raw.isBlank()) null else raw
            var valid = value == null
            if (value != null) valid = when (field.type) {
                "TEXT" -> value is String && value.length <= 2000
                "NUMBER" -> value is Number && validNumber(value)
                "DATE" -> value is String && validDate(value)
                "SELECT" -> value is String && field.options.any { it.value == value && (it.active || previous[field.key] == value) }
                else -> false
            }
            if (!valid) errors[path] = when (field.type) {
                "TEXT" -> "텍스트는 2,000자 이하로 입력해 주세요."
                "NUMBER" -> "숫자는 절댓값 10억 이하, 소수점 6자리 이하로 입력해 주세요."
                "DATE" -> "실제 날짜를 YYYY-MM-DD 형식으로 입력해 주세요."
                "SELECT" -> "활성 선택지 중 하나를 선택해 주세요."
                else -> "지원하지 않는 필드 유형입니다."
            } else merged[field.key] = value
        }
        if (field.required && merged[field.key] == null) errors[path] = "${field.label}을(를) 입력해 주세요."
    }
    failFields(errors, "VALIDATION_FAILED", "티켓 입력값을 확인해 주세요.")
    return merged
}

private fun validNumber(value: Number): Boolean = try {
    val decimal = BigDecimal(value.toString()).stripTrailingZeros()
    decimal.abs() <= BigDecimal("1000000000") && decimal.scale() <= 6
} catch (_: NumberFormatException) { false }

fun validDate(value: String): Boolean = dateKey.matches(value) && try {
    LocalDate.parse(value)
    value.substring(0, 4) != "0000"
} catch (_: DateTimeParseException) { false }

private fun failFields(errors: Map<String, String>, code: String, message: String) {
    if (errors.isNotEmpty()) throw ApiError(HttpStatus.BAD_REQUEST, message, code, errors)
}
