package io.arcapp.backend.integration.internal.client

import io.arcapp.backend.integration.api.*
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

@Component
class GitHubProvider(@Value("\${arc.integrations.github-api-url:https://api.github.com}") apiUrl: String) : RepositoryProvider {
    private val base = providerBase(apiUrl)
    override val kind = ProviderKind.GITHUB
    override fun lookup(token: String, slug: String) = info(providerGet(base, "/repos/$slug", token, true))
    override fun recheck(token: String, id: Long) = info(providerGet(base, "/repositories/$id", token, true))
    private fun info(node: tools.jackson.databind.JsonNode) = RepositoryInfo(node.path("id").asLong(), node.path("full_name").asString()).also { require(it.id > 0 && it.slug.isNotBlank()) }
    override fun validSignature(secret: String, headers: Map<String, String>, body: ByteArray): Boolean {
        val supplied = headers["signature"] ?: return false
        if (!supplied.matches(Regex("sha256=[0-9a-f]{64}"))) return false
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val expected = "sha256=" + mac.doFinal(body).joinToString("") { "%02x".format(it) }
        return MessageDigest.isEqual(supplied.toByteArray(Charsets.UTF_8), expected.toByteArray(Charsets.UTF_8))
    }
    override fun repositoryId(body: String) = providerJson.readTree(body).path("repository").path("id").asLong()
    override fun events(event: String, body: String, repository: RepositoryInfo) = WebhookEvents.github(event, providerJson.readTree(body), repository)
}
