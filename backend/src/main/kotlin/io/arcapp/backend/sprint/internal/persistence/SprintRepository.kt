package io.arcapp.backend.sprint.internal.persistence

import io.arcapp.backend.shared.persistence.insert
import io.arcapp.backend.shared.persistence.one
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.Date

@Repository
class SprintRepository(private val jdbc: JdbcTemplate) {
    fun list(projectId: Long) = jdbc.queryForList("SELECT id,name,goal,start_on AS startOn,end_on AS endOn,status,started_at AS startedAt,completed_at AS completedAt FROM sprints WHERE project_id=? ORDER BY id DESC", projectId)
    fun find(projectId: Long, id: Long) = jdbc.one("SELECT * FROM sprints WHERE id=? AND project_id=?", id, projectId)
    fun create(projectId: Long, name: String, goal: String?, startDate: Date, endDate: Date) = jdbc.insert("INSERT INTO sprints(project_id,name,goal,start_on,end_on,status) VALUES(?,?,?,?,?,'PLANNED')", projectId, name, goal, startDate, endDate)
    fun hasActive(projectId: Long) = jdbc.one("SELECT id FROM sprints WHERE project_id=? AND status='ACTIVE'", projectId) != null
    fun start(id: Long) { jdbc.update("UPDATE sprints SET status='ACTIVE',started_at=UTC_TIMESTAMP(6) WHERE id=?", id) }
    fun close(id: Long) { jdbc.update("UPDATE sprints SET status='CLOSED',completed_at=UTC_TIMESTAMP(6) WHERE id=?", id) }
}
