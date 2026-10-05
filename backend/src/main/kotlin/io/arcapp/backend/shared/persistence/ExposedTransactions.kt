package io.arcapp.backend.shared.persistence

import org.jetbrains.exposed.v1.jdbc.JdbcTransaction
import org.jetbrains.exposed.v1.jdbc.transactions.TransactionManager
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.exceptions.ExposedSQLException
import org.springframework.jdbc.support.SQLExceptionSubclassTranslator
import java.sql.SQLException

private val sqlExceptions = SQLExceptionSubclassTranslator()

/** Join the use case transaction; open one only for calls without a Spring transaction (for example authentication). */
fun <T> dbQuery(block: JdbcTransaction.() -> T): T {
    val current = TransactionManager.currentOrNull()
    try {
        return if (current == null) transaction { maxAttempts = 1; block() } else current.block()
    } catch (error: ExposedSQLException) {
        // Preserve Spring's duplicate-key API contract without returning SQL or bound values.
        throw (sqlExceptions.translate("Database operation", null, error.cause as? SQLException ?: error) ?: error)
    }
}
