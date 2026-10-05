package io.arcapp.backend.savedview.internal.persistence

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import io.arcapp.backend.shared.persistence.dbQuery
import org.springframework.stereotype.Repository

private object SavedViews : Table("saved_views") {
    val id = long("id").autoIncrement()
    val userId = long("user_id")
    val workspaceId = long("workspace_id")
    val projectId = long("project_id")
    val name = varchar("name", 120)
    val viewType = varchar("view_type", 16)
    val filters = text("filters")
    val optionsJson = text("options")
    override val primaryKey = PrimaryKey(id)
}

@Repository
class SavedViewRepository {
    fun list(userId: Long, projectId: Long): List<Map<String, Any>> = dbQuery {
        SavedViews.selectAll().where { (SavedViews.userId eq userId) and (SavedViews.projectId eq projectId) and (SavedViews.viewType eq "GANTT") }
            .orderBy(SavedViews.name)
            .map { mapOf("id" to it[SavedViews.id], "name" to it[SavedViews.name], "filters" to it[SavedViews.filters], "options" to it[SavedViews.optionsJson]) }
    }
    fun create(userId: Long, workspaceId: Long, projectId: Long, name: String, filters: String, options: String): Long = dbQuery {
        SavedViews.insert {
            it[SavedViews.userId] = userId
            it[SavedViews.workspaceId] = workspaceId
            it[SavedViews.projectId] = projectId
            it[SavedViews.name] = name
            it[viewType] = "GANTT"
            it[SavedViews.filters] = filters
            it[optionsJson] = options
        }[SavedViews.id]
    }
    fun delete(userId: Long, projectId: Long, id: Long) { dbQuery { SavedViews.deleteWhere { (SavedViews.id eq id) and (SavedViews.projectId eq projectId) and (SavedViews.userId eq userId) } } }
}
