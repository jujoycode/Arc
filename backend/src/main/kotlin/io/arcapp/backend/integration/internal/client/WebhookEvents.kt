package io.arcapp.backend.integration.internal.client

import io.arcapp.backend.integration.api.DevelopmentEvent
import io.arcapp.backend.integration.api.RepositoryInfo
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

internal object WebhookEvents {
    private fun time(value: String): Instant? {
        if (value.isBlank()) return null
        return try { Instant.parse(value) } catch (_: Exception) {
            try { LocalDateTime.parse(value, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss 'UTC'")).toInstant(ZoneOffset.UTC) } catch (_: Exception) { null }
        }
    }
    private fun commits(node: JsonNode, repository: RepositoryInfo, github: Boolean): List<DevelopmentEvent> = (0 until node.path("commits").size()).map { index ->
        val commit = node.path("commits").path(index)
        val sha = commit.path("id").asString()
        require(sha.matches(Regex("[a-fA-F0-9]{7,64}")))
        val message = commit.path("message").asString()
        val url = if (github) "https://github.com/${repository.slug}/commit/$sha" else "https://gitlab.com/${repository.slug}/-/commit/$sha"
        DevelopmentEvent("COMMIT:$sha", "COMMIT", message.lineSequence().firstOrNull().orEmpty().take(200), message, "COMMITTED", url, time(commit.path("timestamp").asString()))
    }
    fun github(event: String, node: JsonNode, repository: RepositoryInfo): List<DevelopmentEvent> = when (event) {
        "push" -> commits(node, repository, true)
        "pull_request" -> {
            val change = node.path("pull_request")
            val number = change.path("number").asInt()
            require(number > 0)
            val state = when { change.path("merged").asBoolean() -> "MERGED"; change.path("state").asString() == "closed" -> "CLOSED"; else -> "OPEN" }
            listOf(DevelopmentEvent("PR:$number", "CHANGE_REQUEST", change.path("title").asString().take(200), change.path("body").asString(), state, "https://github.com/${repository.slug}/pull/$number", time(change.path("updated_at").asString())))
        }
        else -> emptyList()
    }
    fun gitlab(event: String, node: JsonNode, repository: RepositoryInfo): List<DevelopmentEvent> = when (event) {
        "Push Hook" -> commits(node, repository, false)
        "Merge Request Hook" -> {
            val change = node.path("object_attributes")
            val number = change.path("iid").asInt()
            require(number > 0)
            val state = when (change.path("state").asString()) { "merged" -> "MERGED"; "closed" -> "CLOSED"; else -> "OPEN" }
            listOf(DevelopmentEvent("MR:$number", "CHANGE_REQUEST", change.path("title").asString().take(200), change.path("description").asString(), state, "https://gitlab.com/${repository.slug}/-/merge_requests/$number", time(change.path("updated_at").asString())))
        }
        else -> emptyList()
    }
}
