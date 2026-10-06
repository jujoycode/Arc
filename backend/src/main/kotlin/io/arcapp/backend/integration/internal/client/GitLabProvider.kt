package io.arcapp.backend.integration.internal.client

import io.arcapp.backend.integration.api.*
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.net.URLEncoder
import java.security.MessageDigest

@Component
class GitLabProvider(@Value("\${arc.integrations.gitlab-api-url:https://gitlab.com/api/v4}") apiUrl: String) : RepositoryProvider {
    private val base = providerBase(apiUrl)
    override val kind = ProviderKind.GITLAB
    override fun lookup(token: String, slug: String) = info(providerGet(base, "/projects/${URLEncoder.encode(slug, Charsets.UTF_8)}", token, false))
    override fun recheck(token: String, id: Long) = info(providerGet(base, "/projects/$id", token, false))
    private fun info(node: tools.jackson.databind.JsonNode) = RepositoryInfo(node.path("id").asLong(), node.path("path_with_namespace").asString()).also { require(it.id > 0 && it.slug.isNotBlank()) }
    override fun validSignature(secret: String, headers: Map<String, String>, body: ByteArray): Boolean {
        val supplied = headers["token"] ?: return false
        return MessageDigest.isEqual(supplied.toByteArray(Charsets.UTF_8), secret.toByteArray(Charsets.UTF_8))
    }
    override fun repositoryId(body: String) = providerJson.readTree(body).path("project").path("id").asLong()
    override fun events(event: String, body: String, repository: RepositoryInfo) = WebhookEvents.gitlab(event, providerJson.readTree(body), repository)
}
