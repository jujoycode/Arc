package io.arcapp.backend.milestone.internal.persistence

import io.arcapp.backend.milestone.api.*
import io.arcapp.backend.milestone.internal.validateHistory
import io.arcapp.backend.shared.persistence.dbQuery
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.springframework.stereotype.Repository
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.kotlinModule
import java.time.Clock
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset

private fun ResultRow.detail() = MilestoneDetail(this[Milestones.id], this[Milestones.projectId], this[Milestones.title],
    this[Milestones.targetDate].toString(), this[Milestones.criteria], this[Milestones.description], this[Milestones.ownerId],
    this[Milestones.versionId], MilestoneStatus.valueOf(this[Milestones.status]), this[Milestones.revision],
    this[Milestones.createdAt].toInstant(ZoneOffset.UTC).toString(), this[Milestones.updatedAt].toInstant(ZoneOffset.UTC).toString())

@Repository
class MilestoneRepository {
    private val json = JsonMapper.builder().addModule(kotlinModule()).build()
    fun find(projectId: Long, id: Long, lock: Boolean = false): MilestoneDetail? = dbQuery {
        val query = Milestones.selectAll().where { (Milestones.projectId eq projectId) and (Milestones.id eq id) }
        if (lock) query.forUpdate()
        query.firstOrNull()?.detail()
    }
    fun list(projectId: Long, page: Int, size: Int): MilestonePage<MilestoneDetail> = dbQuery {
        val query = Milestones.selectAll().where { Milestones.projectId eq projectId }
        val total = query.count()
        val items = query.orderBy(Milestones.targetDate to SortOrder.ASC, Milestones.id to SortOrder.ASC)
            .limit(size).offset(page.toLong() * size).map { it.detail() }
        MilestonePage(items, total, page, size)
    }
    fun create(projectId: Long, snapshot: MilestoneSnapshot): Long = dbQuery {
        val now = LocalDateTime.now(Clock.systemUTC())
        Milestones.insert {
            it[Milestones.projectId] = projectId; it[title] = snapshot.title; it[targetDate] = LocalDate.parse(snapshot.targetDate)
            it[criteria] = snapshot.criteria; it[description] = snapshot.description; it[ownerId] = snapshot.ownerId
            it[versionId] = snapshot.versionId; it[status] = snapshot.status.name; it[revision] = snapshot.revision
            it[createdAt] = now; it[updatedAt] = now
        }[Milestones.id]
    }
    fun update(projectId: Long, id: Long, previousRevision: Long, snapshot: MilestoneSnapshot): Boolean = dbQuery {
        Milestones.update({ (Milestones.projectId eq projectId) and (Milestones.id eq id) and (Milestones.revision eq previousRevision) }) {
            it[title] = snapshot.title; it[targetDate] = LocalDate.parse(snapshot.targetDate); it[criteria] = snapshot.criteria
            it[description] = snapshot.description; it[ownerId] = snapshot.ownerId; it[versionId] = snapshot.versionId
            it[status] = snapshot.status.name; it[revision] = snapshot.revision; it[updatedAt] = LocalDateTime.now(Clock.systemUTC())
        } == 1
    }
    fun append(id: Long, actorId: Long, type: MilestoneEvent, payload: MilestoneHistoryPayload) = dbQuery {
        validateHistory(type, payload)
        MilestoneActivities.insert {
            it[milestoneId] = id; it[MilestoneActivities.actorId] = actorId; it[MilestoneActivities.type] = type.name
            it[MilestoneActivities.payload] = json.writeValueAsString(payload); it[createdAt] = LocalDateTime.now(Clock.systemUTC())
        }
        Unit
    }
    fun activities(id: Long, page: Int, size: Int): MilestonePage<MilestoneActivity> = dbQuery {
        val total = MilestoneActivities.selectAll().where { MilestoneActivities.milestoneId eq id }.count()
        val items = MilestoneActivities.join(MilestoneActors, JoinType.INNER, MilestoneActivities.actorId, MilestoneActors.id)
            .selectAll().where { MilestoneActivities.milestoneId eq id }.orderBy(MilestoneActivities.id to SortOrder.DESC)
            .limit(size).offset(page.toLong() * size).map {
                val type = MilestoneEvent.valueOf(it[MilestoneActivities.type])
                val payload = json.readValue(it[MilestoneActivities.payload], MilestoneHistoryPayload::class.java)
                validateHistory(type, payload)
                MilestoneActivity(it[MilestoneActivities.id], type, it[MilestoneActivities.actorId], it[MilestoneActors.displayName],
                    it[MilestoneActivities.createdAt].toInstant(ZoneOffset.UTC).toString(), payload)
            }
        MilestonePage(items, total, page, size)
    }
}
