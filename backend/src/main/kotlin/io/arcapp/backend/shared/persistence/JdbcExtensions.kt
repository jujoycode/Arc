package io.arcapp.backend.shared.persistence

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.support.GeneratedKeyHolder

fun JdbcTemplate.one(sql: String, vararg args: Any?): Map<String, Any?>? = queryForList(sql, *args).firstOrNull()

fun JdbcTemplate.insert(sql: String, vararg args: Any?): Long {
    val holder = GeneratedKeyHolder()
    update({ connection ->
        connection.prepareStatement(sql, java.sql.Statement.RETURN_GENERATED_KEYS).also { statement ->
            args.forEachIndexed { index, value -> statement.setObject(index + 1, value) }
        }
    }, holder)
    return holder.key!!.toLong()
}

fun Map<String, Any?>.long(name: String): Long = (this[name] as Number).toLong()
