package io.arcapp.backend.sprint.internal.persistence

import io.arcapp.backend.shared.persistence.dbQuery
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.javatime.date
import org.jetbrains.exposed.v1.javatime.datetime
import org.jetbrains.exposed.v1.jdbc.*
import org.springframework.stereotype.Repository
import java.sql.Date
import java.time.Clock
import java.time.LocalDateTime
import java.time.ZoneOffset

private object Sprints : Table("sprints") {
    val id = long("id").autoIncrement()
    val projectId = long("project_id")
    val name = varchar("name", 120)
    val goal = text("goal").nullable()
    val startOn = date("start_on")
    val endOn = date("end_on")
    val status = varchar("status", 16)
    val startedAt = datetime("started_at").nullable()
    val completedAt = datetime("completed_at").nullable()
    override val primaryKey = PrimaryKey(id)
}

@Repository
class SprintRepository {
    fun list(projectId: Long): List<Map<String, Any?>> = dbQuery {
        Sprints.selectAll().where { Sprints.projectId eq projectId }.orderBy(Sprints.id to SortOrder.DESC)
            .map { mapOf("id" to it[Sprints.id], "name" to it[Sprints.name], "goal" to it[Sprints.goal], "startOn" to it[Sprints.startOn], "endOn" to it[Sprints.endOn], "status" to it[Sprints.status], "startedAt" to it[Sprints.startedAt]?.toInstant(ZoneOffset.UTC), "completedAt" to it[Sprints.completedAt]?.toInstant(ZoneOffset.UTC)) }
    }
    fun find(projectId: Long, id: Long): Map<String, Any?>? = dbQuery {
        Sprints.selectAll().where { (Sprints.id eq id) and (Sprints.projectId eq projectId) }.firstOrNull()?.let { row -> Sprints.columns.associate { it.name to row[it] } }
    }
    fun create(projectId: Long, name: String, goal: String?, startDate: Date, endDate: Date): Long = dbQuery {
        Sprints.insert { it[Sprints.projectId] = projectId; it[Sprints.name] = name; it[Sprints.goal] = goal; it[startOn] = startDate.toLocalDate(); it[endOn] = endDate.toLocalDate(); it[status] = "PLANNED" }[Sprints.id]
    }
    fun hasActive(projectId: Long) = dbQuery { Sprints.select(Sprints.id).where { (Sprints.projectId eq projectId) and (Sprints.status eq "ACTIVE") }.any() }
    fun start(id: Long) = dbQuery { Sprints.update({ Sprints.id eq id }) { it[status] = "ACTIVE"; it[startedAt] = LocalDateTime.now(Clock.systemUTC()) }; Unit }
    fun close(id: Long) = dbQuery { Sprints.update({ Sprints.id eq id }) { it[status] = "CLOSED"; it[completedAt] = LocalDateTime.now(Clock.systemUTC()) }; Unit }
}
