package io.arcapp.backend.ticketfield.internal

import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.ticketfield.api.CustomTicketField
import io.arcapp.backend.ticketfield.api.defaultTicketFieldPolicy
import io.arcapp.backend.ticketfield.internal.persistence.TicketFieldRepository
import io.arcapp.backend.workspace.api.WorkspaceAccess
import io.arcapp.backend.workspace.internal.persistence.WorkspaceRepository
import org.jetbrains.exposed.v1.spring.transaction.SpringTransactionManager
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class TicketFieldPersistenceTest {
    @Test
    fun `policy defaults grants isolation revisions and rollback share one transaction`() {
        val source = DriverManagerDataSource("jdbc:h2:mem:${UUID.randomUUID()};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "")
        val jdbc = JdbcTemplate(source)
        jdbc.execute("CREATE TABLE workspaces(id BIGINT PRIMARY KEY,name VARCHAR(120),deleted_at TIMESTAMP NULL)")
        jdbc.execute("CREATE TABLE workspace_members(workspace_id BIGINT,user_id BIGINT,role VARCHAR(16),PRIMARY KEY(workspace_id,user_id))")
        jdbc.execute("CREATE TABLE ticket_field_policies(workspace_id BIGINT PRIMARY KEY,revision BIGINT,standard_fields TEXT,custom_fields TEXT)")
        jdbc.execute("INSERT INTO workspaces(id,name) VALUES (1,'팀'),(2,'다른 팀')")
        jdbc.execute("INSERT INTO workspace_members VALUES (1,1,'OWNER'),(1,2,'ADMIN'),(1,3,'MEMBER'),(2,4,'OWNER')")
        val transactions = TransactionTemplate(SpringTransactionManager(source))
        val service = TicketFieldService(TicketFieldRepository(), WorkspaceAccess(WorkspaceRepository()))
        val initial = defaultTicketFieldPolicy(1)
        assertEquals(initial, service.get(1, 1))
        val input = TicketFieldPolicyInput(0, initial.standardFields, listOf(CustomTicketField("cf_cost", "NUMBER", "원가", order = 0)))

        assertFailsWith<IllegalStateException> {
            transactions.executeWithoutResult { service.save(1, 1, input); error("Later failure must roll back the policy revision and data") }
        }
        assertEquals(initial, service.get(1, 1))
        transactions.executeWithoutResult { assertEquals(1L, service.save(1, 1, input).revision) }
        assertEquals("cf_cost", service.get(3, 1).customFields.single().key)
        val stale = assertFailsWith<ApiError> { transactions.executeWithoutResult { service.save(2, 1, input) } }
        assertEquals(HttpStatus.CONFLICT, stale.status)
        assertEquals("TICKET_FIELDS_CHANGED", stale.code)
        val denied = assertFailsWith<ApiError> { transactions.executeWithoutResult { service.save(3, 1, input.copy(revision = 1)) } }
        assertEquals(HttpStatus.FORBIDDEN, denied.status)
        assertFailsWith<ApiError> { service.get(4, 1) }
        assertEquals(defaultTicketFieldPolicy(2), service.get(4, 2))
        transactions.executeWithoutResult { assertEquals(2L, service.save(2, 1, input.copy(revision = 1)).revision) }
        jdbc.execute("SHUTDOWN")
    }
}
