package io.arcapp.backend.project.internal

data class ProjectInput(val name: String, val key: String, val description: String? = null, val parentProjectId: Long? = null)
data class ProjectEdit(val name: String, val key: String? = null, val description: String? = null, val parentProjectId: Long? = null, val archived: Boolean = false)
data class VersionInput(val name: String, val description: String? = null, val startDate: String? = null, val dueDate: String)
