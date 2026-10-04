package io.arcapp.backend

import jakarta.servlet.http.HttpServletRequest
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.*

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

data class SavedViewInput(val name: String, val filters: String = "{}", val options: String = "{}")

@RestController
class SavedViewApi(private val jdbc: JdbcTemplate) {
    @GetMapping("/api/projects/{projectId}/saved-views")
    fun list(request: HttpServletRequest, @PathVariable projectId: Long): List<Map<String, Any>> {
        projectRow(jdbc, projectId, request.userId())
        val userId = request.userId()
        return transaction {
            SavedViews.selectAll().where { (SavedViews.userId eq userId) and (SavedViews.projectId eq projectId) and (SavedViews.viewType eq "GANTT") }
                .orderBy(SavedViews.name)
                .map { mapOf("id" to it[SavedViews.id], "name" to it[SavedViews.name], "filters" to it[SavedViews.filters], "options" to it[SavedViews.optionsJson]) }
        }
    }

    @PostMapping("/api/projects/{projectId}/saved-views")
    fun create(request: HttpServletRequest, @PathVariable projectId: Long, @RequestBody input: SavedViewInput): Map<String, Long> {
        val project = projectRow(jdbc, projectId, request.userId())
        if (input.name.isBlank() || input.name.length > 120 || !input.filters.trim().startsWith("{") || !input.options.trim().startsWith("{"))
            throw ApiError(HttpStatus.BAD_REQUEST, "보기 이름 또는 설정이 올바르지 않습니다.")
        val id = transaction {
            SavedViews.insert {
                it[userId] = request.userId()
                it[workspaceId] = project.long("workspace_id")
                it[SavedViews.projectId] = projectId
                it[name] = input.name.trim()
                it[viewType] = "GANTT"
                it[filters] = input.filters
                it[optionsJson] = input.options
            }[SavedViews.id]
        }
        return mapOf("id" to id)
    }

    @DeleteMapping("/api/projects/{projectId}/saved-views/{id}")
    fun delete(request: HttpServletRequest, @PathVariable projectId: Long, @PathVariable id: Long) {
        projectRow(jdbc, projectId, request.userId())
        val userId = request.userId()
        transaction { SavedViews.deleteWhere { (SavedViews.id eq id) and (SavedViews.projectId eq projectId) and (SavedViews.userId eq userId) } }
    }
}
