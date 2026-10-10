package io.arcapp.backend.shared.api

import org.springframework.http.HttpStatus
import java.time.LocalDate
import java.time.format.DateTimeParseException

/** Calendar input for MySQL DATE columns. java.sql.Date.valueOf(String) normalizes invalid days. */
fun calendarDate(value: String, field: String): LocalDate {
    val date = if (Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(value)) try {
        LocalDate.parse(value).takeIf { it.year in 1000..9999 }
    } catch (_: DateTimeParseException) { null } else null
    if (date == null) {
        val message = "실제 날짜를 YYYY-MM-DD 형식으로 입력해 주세요."
        throw ApiError(HttpStatus.BAD_REQUEST, message, "VALIDATION_FAILED", mapOf(field to message))
    }
    return date
}
