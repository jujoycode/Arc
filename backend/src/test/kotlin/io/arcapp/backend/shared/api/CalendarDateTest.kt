package io.arcapp.backend.shared.api

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class CalendarDateTest {
    @Test
    fun `calendar dates reject normalized impossible days and preserve the field error path`() {
        assertEquals(LocalDate.of(2024, 2, 29), calendarDate("2024-02-29", "startOn"))
        assertEquals(LocalDate.of(2026, 10, 10), calendarDate("2026-10-10", "dueDate"))
        for (invalid in listOf("2026-02-30", "2025-02-29", "2026-04-31", "2026-13-01", "2026-2-01", "2026-01-01T00:00:00Z", "0000-01-01")) {
            val error = assertFailsWith<ApiError> { calendarDate(invalid, "endOn") }
            assertEquals("VALIDATION_FAILED", error.code)
            assertEquals(setOf("endOn"), error.fieldErrors.keys)
        }
    }
}
