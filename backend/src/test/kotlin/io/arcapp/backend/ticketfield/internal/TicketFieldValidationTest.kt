package io.arcapp.backend.ticketfield.internal

import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.ticketfield.api.*
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TicketFieldValidationTest {
    private val base = defaultTicketFieldPolicy(1)
    private val standard = mapOf("title" to "계획", "type" to "TASK", "status" to "TODO", "progress" to 0)
    private fun policy(vararg fields: CustomTicketField) = base.copy(customFields = fields.toList())
    private fun custom(type: String, required: Boolean = false, active: Boolean = true) =
        CustomTicketField("cf_work", type, "업무 필드", active = active, required = required, order = 0)

    @Test
    fun `policy changes retain stable types keys options and fixed standard semantics`() {
        val select = custom("SELECT").copy(options = listOf(TicketFieldOption("web", "웹"), TicketFieldOption("api", "API")))
        val old = policy(select)
        assertFailsWith<ApiError> { validateTicketFieldPolicy(policy(select.copy(type = "TEXT", options = emptyList())), old) }
        assertFailsWith<ApiError> { validateTicketFieldPolicy(base, old) }
        assertFailsWith<ApiError> { validateTicketFieldPolicy(policy(select.copy(options = select.options.take(1))), old) }
        val hidden = base.copy(standardFields = base.standardFields.map { if (it.key == "status") it.copy(visible = false, required = false) else it })
        assertFailsWith<ApiError> { validateTicketFieldPolicy(hidden, base) }
        val contradictory = base.copy(standardFields = base.standardFields.map { if (it.key == "startDate") it.copy(visible = false, required = true) else it })
        assertFailsWith<ApiError> { validateTicketFieldPolicy(contradictory, base) }
        validateTicketFieldPolicy(policy(select.copy(options = select.options.map { if (it.value == "web") it.copy(active = false) else it })), old)
    }

    @Test
    fun `number values distinguish zero null typed numbers precision range and finiteness`() {
        val policy = policy(custom("NUMBER"))
        assertEquals(0, validateTicketFieldValues(policy, standard, mapOf("cf_work" to 0), emptyMap())["cf_work"])
        assertNull(validateTicketFieldValues(policy, standard, mapOf("cf_work" to null), emptyMap())["cf_work"])
        assertEquals(-12.123456, validateTicketFieldValues(policy, standard, mapOf("cf_work" to -12.123456), emptyMap())["cf_work"])
        for (bad in listOf("12", 0.1234567, 1000000001, Double.NaN, Double.POSITIVE_INFINITY, true)) {
            val error = assertFailsWith<ApiError> { validateTicketFieldValues(policy, standard, mapOf("cf_work" to bad), emptyMap()) }
            assertEquals("VALIDATION_FAILED", error.code)
            assertTrue("customFields.cf_work" in error.fieldErrors)
        }
    }

    @Test
    fun `dates validate actual calendar days and text remains bounded`() {
        val dates = policy(custom("DATE"))
        assertEquals("2024-02-29", validateTicketFieldValues(dates, standard, mapOf("cf_work" to "2024-02-29"), emptyMap())["cf_work"])
        for (bad in listOf("2025-02-29", "2026-02-31", "2026-2-01", "2026-13-01", "0000-01-01"))
            assertFailsWith<ApiError> { validateTicketFieldValues(dates, standard, mapOf("cf_work" to bad), emptyMap()) }
        val text = policy(custom("TEXT"))
        assertNull(validateTicketFieldValues(text, standard, mapOf("cf_work" to "   "), emptyMap())["cf_work"])
        assertFailsWith<ApiError> { validateTicketFieldValues(text, standard, mapOf("cf_work" to "a".repeat(2001)), emptyMap()) }
    }

    @Test
    fun `inactive options preserve existing values while new assignments are rejected`() {
        val select = custom("SELECT").copy(options = listOf(TicketFieldOption("retired", "이전", active = false), TicketFieldOption("active", "현재")))
        val policy = policy(select)
        assertEquals("retired", validateTicketFieldValues(policy, standard, mapOf("cf_work" to "retired"), mapOf("cf_work" to "retired"))["cf_work"])
        assertFailsWith<ApiError> { validateTicketFieldValues(policy, standard, mapOf("cf_work" to "retired"), emptyMap()) }
        assertEquals("active", validateTicketFieldValues(policy, standard, mapOf("cf_work" to "active"), mapOf("cf_work" to "retired"))["cf_work"])
    }

    @Test
    fun `omitted and inactive values survive plans and new required values do not silently pass`() {
        val previous = mapOf("cf_work" to "기존 값")
        assertEquals(previous, validateTicketFieldValues(policy(custom("TEXT")), standard, null, previous))
        assertEquals(previous, validateTicketFieldValues(policy(custom("TEXT", required = true, active = false)), standard, mapOf("cf_work" to null), previous))
        assertFailsWith<ApiError> { validateTicketFieldValues(policy(custom("TEXT", required = true)), standard, null, emptyMap()) }
        assertFailsWith<ApiError> { validateTicketFieldValues(base, standard, mapOf("cf_other_workspace" to "침범"), emptyMap()) }
        assertFailsWith<ApiError> { validateTicketFieldValues(base, standard + ("title" to " "), null, emptyMap()) }
        assertEquals("기존 값", validateTicketFieldValues(policy(custom("TEXT", required = true)), standard, null, previous)["cf_work"])
    }
}
