package io.arcapp.backend.milestone.internal

import io.arcapp.backend.milestone.api.*
import io.arcapp.backend.shared.api.ApiError
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.kotlinModule
import kotlin.test.*

class MilestoneValidationTest {
    private val input = MilestoneInput("계획", "2024-02-29", "달성 기준")
    private val snapshot = MilestoneSnapshot("계획", "2024-02-29", "달성 기준", null, null, null, MilestoneStatus.PLANNED, 0)
    private fun invalid(field: String, block: () -> Unit) {
        val error = assertFailsWith<ApiError>(block = block)
        assertEquals(HttpStatus.BAD_REQUEST, error.status)
        assertEquals("VALIDATION_FAILED", error.code)
        assertTrue(field in error.fieldErrors)
    }
    @Test fun `title criteria description and reason are normalized and bounded`() {
        assertEquals("계획", validateMetadata(input.copy(title = "  계획  ")).title)
        for (title in listOf(null, " ", "a".repeat(121))) invalid("title") { validateMetadata(input.copy(title = title)) }
        for (criteria in listOf(null, " ", "a".repeat(10001))) invalid("criteria") { validateMetadata(input.copy(criteria = criteria)) }
        invalid("description") { validateMetadata(input.copy(description = "a".repeat(10001))) }
        invalid("reason") { validateReason("a".repeat(1001), false) }
        assertEquals("사유", validateReason(" 사유 ", true))
        validateMetadata(input.copy(title = "a".repeat(120), criteria = "a".repeat(10000), description = "a".repeat(10000)))
    }
    @Test fun `calendar dates must be actual exact MySQL dates`() {
        for (date in listOf(null, "2025-02-29", "2026-02-31", "2026-2-01", "0999-12-31", "10000-01-01"))
            invalid("targetDate") { validateMetadata(input.copy(targetDate = date)) }
        for (date in listOf("1000-01-01", "9999-12-31", "2024-02-29")) assertEquals(date, validateMetadata(input.copy(targetDate = date)).targetDate)
    }
    @Test fun `HTTP mapper omission and null never become revision zero`() {
        val json = JsonMapper.builder().addModule(kotlinModule()).build()
        for (body in listOf("{}", "{\"revision\":null}", "{\"revision\":-1}")) {
            invalid("revision") { validateRevision(json.readValue(body, MilestoneEdit::class.java).revision) }
            invalid("revision") { validateRevision(json.readValue(body, MilestoneTransition::class.java).revision) }
        }
        assertEquals(0L, validateRevision(0))
    }
    @Test fun `reasons revision and state prevent invalid changes`() {
        for (reason in listOf(null, "", "  ")) invalid("reason") { validateReason(reason, true) }
        assertNull(validateReason(" ", false))
        val stale = assertFailsWith<ApiError> { requireMilestoneRevision(snapshot, 1) }
        assertEquals("MILESTONE_CHANGED", stale.code)
        assertEquals(HttpStatus.CONFLICT, stale.status)
        assertEquals(HttpStatus.CONFLICT, assertFailsWith<ApiError> { requireMilestoneState(snapshot.copy(status = MilestoneStatus.CANCELLED), MilestoneStatus.PLANNED) }.status)
    }
}
