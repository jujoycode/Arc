package io.arcapp.backend.milestone.internal

import io.arcapp.backend.milestone.api.*
import io.arcapp.backend.milestone.internal.persistence.MilestoneRepository
import org.jetbrains.exposed.v1.spring.transaction.SpringTransactionManager
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import kotlin.test.*

class MilestonePersistenceTest {
    private val planned = MilestoneSnapshot("계획", "2024-02-29", "검증\n완료", null, null, null, MilestoneStatus.PLANNED, 0)
    private fun database(test: (JdbcTemplate, TransactionTemplate, MilestoneRepository) -> Unit) {
        val source = DriverManagerDataSource("jdbc:h2:mem:${UUID.randomUUID()};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "")
        val jdbc = JdbcTemplate(source)
        jdbc.execute("CREATE TABLE milestones(id BIGINT AUTO_INCREMENT PRIMARY KEY,project_id BIGINT,title VARCHAR(120),target_date DATE,criteria TEXT,description TEXT,owner_id BIGINT,version_id BIGINT,status VARCHAR(16),revision BIGINT,created_at TIMESTAMP,updated_at TIMESTAMP)")
        jdbc.execute("CREATE TABLE milestone_activities(id BIGINT AUTO_INCREMENT PRIMARY KEY,milestone_id BIGINT,actor_id BIGINT,event_type VARCHAR(16),payload TEXT,created_at TIMESTAMP)")
        try { test(jdbc, TransactionTemplate(SpringTransactionManager(source)), MilestoneRepository()) } finally { jdbc.execute("SHUTDOWN") }
    }
    @Test fun `failure after metadata insert rolls back the new milestone`() = database { jdbc, tx, repository ->
        assertFailsWith<IllegalStateException> {
            tx.executeWithoutResult {
                repository.create(1, planned)
                assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM milestones", Int::class.java))
                error("Later failure")
            }
        }
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM milestones", Int::class.java))
    }
    @Test fun `failure after activity insertion rolls back metadata revision state and history`() = database { jdbc, tx, repository ->
        val id = tx.execute { repository.create(1, planned) }!!
        assertFailsWith<IllegalStateException> {
            tx.executeWithoutResult {
                val cancelled = planned.copy(status = MilestoneStatus.CANCELLED, revision = 1)
                assertTrue(repository.update(1, id, 0, cancelled))
                repository.append(id, 1, MilestoneEvent.CANCELLED, MilestoneHistoryPayload(previousRevision = 0, revision = 1, reason = "중단", before = planned, after = cancelled))
                assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM milestone_activities", Int::class.java))
                error("Later failure")
            }
        }
        assertEquals(0L, jdbc.queryForObject("SELECT revision FROM milestones WHERE id=?", Long::class.java, id))
        assertEquals("PLANNED", jdbc.queryForObject("SELECT status FROM milestones WHERE id=?", String::class.java, id))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM milestone_activities", Int::class.java))
    }
}
