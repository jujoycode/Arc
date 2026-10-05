package io.arcapp.backend.sprint.internal

data class SprintInput(val name: String, val goal: String? = null, val startOn: String, val endOn: String)
data class SprintAssignment(val sprintId: Long?)
data class BacklogOrder(val issueIds: List<Long>)
data class SprintClose(val nextSprintId: Long? = null)
