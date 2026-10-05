package io.arcapp.backend.shared.persistence

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.spring.transaction.SpringTransactionManager
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.dao.DuplicateKeyException
import org.springframework.transaction.support.TransactionTemplate
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import java.util.UUID

class ExposedTransactionsTest {
    private object Writes : Table("writes") { val id = integer("id") }

    @Test
    fun `Exposed and JDBC share commit and rollback in the use case transaction`() {
        val dataSource = DriverManagerDataSource("jdbc:h2:mem:${UUID.randomUUID()};DB_CLOSE_DELAY=-1", "sa", "")
        val jdbc = JdbcTemplate(dataSource)
        jdbc.execute("CREATE TABLE writes(id INT PRIMARY KEY)")
        val transaction = TransactionTemplate(SpringTransactionManager(dataSource))

        assertFailsWith<IllegalStateException> {
            transaction.executeWithoutResult {
                dbQuery { Writes.insert { it[id] = 1 } }
                jdbc.update("INSERT INTO writes(id) VALUES(?)", 2)
                // A repository helper must join rather than commit before this later failure.
                assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM writes", Int::class.java))
                error("Later operation failed")
            }
        }
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM writes", Int::class.java))

        transaction.executeWithoutResult {
            jdbc.update("INSERT INTO writes(id) VALUES(?)", 3)
            dbQuery { Writes.insert { it[id] = 4 } }
        }
        assertEquals(listOf(3, 4), jdbc.queryForList("SELECT id FROM writes ORDER BY id", Int::class.java))
        assertFailsWith<DuplicateKeyException> { dbQuery { Writes.insert { it[id] = 3 } } }
        jdbc.execute("SHUTDOWN")
    }
}
