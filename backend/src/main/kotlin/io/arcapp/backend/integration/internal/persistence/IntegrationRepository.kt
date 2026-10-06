package io.arcapp.backend.integration.internal.persistence

import io.arcapp.backend.integration.api.*
import io.arcapp.backend.shared.persistence.dbQuery
import org.jetbrains.exposed.v1.core.*
import org.jetbrains.exposed.v1.jdbc.*
import org.springframework.stereotype.Repository
import java.time.Clock
import java.time.LocalDateTime
import java.time.ZoneOffset

internal data class Connection(val id: Long, val projectId: Long, val provider: ProviderKind, val repository: RepositoryInfo, val status: String, val token: String?, val secret: String?) {
    fun context(label: String) = "$projectId:$provider:${repository.id}:$label"
}
internal data class Delivery(val id: Long, val connectionId: Long, val event: String, val payload: String)
private fun ResultRow.connection() = Connection(this[Connections.id], this[Connections.projectId], ProviderKind.valueOf(this[Connections.provider]), RepositoryInfo(this[Connections.repositoryId], this[Connections.slug]), this[Connections.status], this[Connections.token], this[Connections.secret])
private fun now() = LocalDateTime.now(Clock.systemUTC())

@Repository
internal class IntegrationRepository {
    fun find(id: Long): Connection? = dbQuery { Connections.selectAll().where { Connections.id eq id }.firstOrNull()?.connection() }
    fun list(projectId: Long): List<Connection> = dbQuery { Connections.selectAll().where { Connections.projectId eq projectId }.orderBy(Connections.id).map { it.connection() } }
    fun save(projectId: Long, provider: ProviderKind, repository: RepositoryInfo, token: String, secret: String): Long = dbQuery {
        val existing = Connections.select(Connections.id).where { (Connections.projectId eq projectId) and (Connections.provider eq provider.name) and (Connections.repositoryId eq repository.id) }.firstOrNull()?.get(Connections.id)
        if (existing != null) {
            Connections.update({ Connections.id eq existing }) { it[slug] = repository.slug; it[status] = "ACTIVE"; it[Connections.token] = token; it[Connections.secret] = secret }
            existing
        } else Connections.insert { it[Connections.projectId] = projectId; it[Connections.provider] = provider.name; it[repositoryId] = repository.id; it[slug] = repository.slug; it[Connections.token] = token; it[Connections.secret] = secret }[Connections.id]
    }
    fun status(id: Long, status: String, slug: String? = null) = dbQuery {
        Connections.update({ Connections.id eq id }) { it[Connections.status] = status; if (slug != null) it[Connections.slug] = slug; if (status == "DISCONNECTED") { it[token] = null; it[secret] = null } }; Unit
    }
    fun enqueue(connectionId: Long, deliveryId: String, event: String, payload: String) = dbQuery {
        Deliveries.insertIgnore { it[Deliveries.connectionId] = connectionId; it[Deliveries.deliveryId] = deliveryId; it[Deliveries.event] = event; it[Deliveries.payload] = payload }.insertedCount > 0
    }
    fun next(): Delivery? = dbQuery {
        Deliveries.selectAll().where { (Deliveries.status inList listOf("PENDING", "FAILED")) and (Deliveries.attempts less 5) and (Deliveries.nextAttemptAt lessEq now()) }
            .orderBy(Deliveries.id).limit(1).forUpdate().firstOrNull()?.let { Delivery(it[Deliveries.id], it[Deliveries.connectionId], it[Deliveries.event], checkNotNull(it[Deliveries.payload])) }
    }
    fun complete(id: Long) = dbQuery {
        Deliveries.update({ Deliveries.id eq id }) { it[status] = "COMPLETED"; it[payload] = null; it[processedAt] = now(); it[error] = null; it[attempts] = Deliveries.attempts + 1 }; Unit
    }
    fun failed(id: Long) = dbQuery {
        val attempt = Deliveries.select(Deliveries.attempts).where { Deliveries.id eq id }.single()[Deliveries.attempts] + 1
        Deliveries.update({ Deliveries.id eq id }) { it[status] = "FAILED"; it[attempts] = attempt; it[error] = "PROCESSING_FAILED"; it[nextAttemptAt] = now().plusSeconds(1L shl attempt.coerceAtMost(8)) }; Unit
    }
    fun deliveries(connectionId: Long): List<Map<String, Any?>> = dbQuery {
        Deliveries.select(Deliveries.id, Deliveries.deliveryId, Deliveries.event, Deliveries.status, Deliveries.attempts, Deliveries.error, Deliveries.createdAt, Deliveries.processedAt)
            .where { Deliveries.connectionId eq connectionId }.orderBy(Deliveries.id to SortOrder.DESC).limit(20)
            .map { mapOf("id" to it[Deliveries.id], "deliveryId" to it[Deliveries.deliveryId], "event" to it[Deliveries.event], "status" to it[Deliveries.status], "attempts" to it[Deliveries.attempts], "error" to it[Deliveries.error], "createdAt" to it[Deliveries.createdAt].toInstant(ZoneOffset.UTC), "processedAt" to it[Deliveries.processedAt]?.toInstant(ZoneOffset.UTC)) }
    }
    fun retry(connectionId: Long, id: Long) = dbQuery {
        Deliveries.update({ (Deliveries.id eq id) and (Deliveries.connectionId eq connectionId) and (Deliveries.status eq "FAILED") }) { it[status] = "PENDING"; it[attempts] = 0; it[error] = null; it[nextAttemptAt] = now() }
    }
    fun link(issueId: Long, connectionId: Long, event: DevelopmentEvent) = dbQuery {
        val existing = DevelopmentLinks.selectAll().where { (DevelopmentLinks.issueId eq issueId) and (DevelopmentLinks.connectionId eq connectionId) and (DevelopmentLinks.externalId eq event.externalId) }.firstOrNull()
        val sourceTime = event.updatedAt?.let { LocalDateTime.ofInstant(it, ZoneOffset.UTC) }
        if (existing != null) {
            val previousTime = existing[DevelopmentLinks.sourceUpdatedAt]
            val ranks = mapOf("OPEN" to 0, "CLOSED" to 1, "MERGED" to 2, "COMMITTED" to 0)
            if (existing[DevelopmentLinks.state] == "MERGED") return@dbQuery
            if (previousTime != null && sourceTime != null && sourceTime < previousTime) return@dbQuery
            if ((previousTime == null || sourceTime == null || sourceTime == previousTime) && ranks.getValue(event.state) < ranks.getValue(existing[DevelopmentLinks.state])) return@dbQuery
            DevelopmentLinks.update({ DevelopmentLinks.id eq existing[DevelopmentLinks.id] }) { it[title] = event.title; it[state] = event.state; it[url] = event.url; it[sourceUpdatedAt] = sourceTime ?: previousTime }
        } else DevelopmentLinks.insert { it[DevelopmentLinks.issueId] = issueId; it[DevelopmentLinks.connectionId] = connectionId; it[externalId] = event.externalId; it[kind] = event.kind; it[title] = event.title; it[state] = event.state; it[url] = event.url; it[sourceUpdatedAt] = sourceTime }
        Unit
    }
    fun links(issueId: Long): List<Map<String, Any?>> = dbQuery {
        DevelopmentLinks.join(Connections, JoinType.INNER, DevelopmentLinks.connectionId, Connections.id)
            .select(DevelopmentLinks.columns + listOf(Connections.provider, Connections.slug, Connections.status)).where { DevelopmentLinks.issueId eq issueId }.orderBy(DevelopmentLinks.updatedAt to SortOrder.DESC)
            .map { mapOf("id" to it[DevelopmentLinks.id], "provider" to it[Connections.provider], "repository" to it[Connections.slug], "connectionStatus" to it[Connections.status], "kind" to it[DevelopmentLinks.kind], "title" to it[DevelopmentLinks.title], "state" to it[DevelopmentLinks.state], "url" to it[DevelopmentLinks.url], "updatedAt" to it[DevelopmentLinks.updatedAt].toInstant(ZoneOffset.UTC)) }
    }
}
