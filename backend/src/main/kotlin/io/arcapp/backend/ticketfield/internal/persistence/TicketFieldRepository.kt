package io.arcapp.backend.ticketfield.internal.persistence

import io.arcapp.backend.shared.persistence.dbQuery
import io.arcapp.backend.ticketfield.api.*
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.update
import org.springframework.stereotype.Repository
import tools.jackson.core.type.TypeReference
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.kotlinModule

private object TicketFieldPolicies : Table("ticket_field_policies") {
    val workspaceId = long("workspace_id")
    val revision = long("revision")
    val standardFields = text("standard_fields")
    val customFields = text("custom_fields")
    override val primaryKey = PrimaryKey(workspaceId)
}

@Repository
class TicketFieldRepository {
    private val json = JsonMapper.builder().addModule(kotlinModule()).build()
    fun find(workspaceId: Long): TicketFieldPolicy? = dbQuery {
        TicketFieldPolicies.selectAll().where { TicketFieldPolicies.workspaceId eq workspaceId }.firstOrNull()?.let {
            TicketFieldPolicy(workspaceId, it[TicketFieldPolicies.revision],
                json.readValue(it[TicketFieldPolicies.standardFields], object : TypeReference<List<StandardTicketField>>() {}),
                json.readValue(it[TicketFieldPolicies.customFields], object : TypeReference<List<CustomTicketField>>() {}))
        }
    }
    /** The workspace lock serializes the first insert as well as later revisions. */
    fun save(policy: TicketFieldPolicy) = dbQuery {
        val standard = json.writeValueAsString(policy.standardFields)
        val custom = json.writeValueAsString(policy.customFields)
        if (TicketFieldPolicies.update({ TicketFieldPolicies.workspaceId eq policy.workspaceId }) {
                it[revision] = policy.revision; it[standardFields] = standard; it[customFields] = custom
            } == 0) TicketFieldPolicies.insert {
            it[workspaceId] = policy.workspaceId; it[revision] = policy.revision; it[standardFields] = standard; it[customFields] = custom
        }
        Unit
    }
}
