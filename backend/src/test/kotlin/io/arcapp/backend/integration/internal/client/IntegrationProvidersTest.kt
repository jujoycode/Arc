package io.arcapp.backend.integration.internal.client

import com.sun.net.httpserver.HttpServer
import io.arcapp.backend.integration.api.RepositoryInfo
import io.arcapp.backend.integration.internal.ConnectionSecrets
import io.arcapp.backend.shared.api.ApiError
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import java.net.InetSocketAddress
import java.time.Instant
import java.util.Base64
import javax.crypto.AEADBadTagException
import kotlin.test.*

class IntegrationProvidersTest {
    @Test
    fun `GitHub signature rejects changed bytes and GitLab rejects a different token`() {
        val github = GitHubProvider("https://api.github.com")
        val bytes = "The quick brown fox jumps over the lazy dog".toByteArray()
        val signature = "sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
        assertTrue(github.validSignature("key", mapOf("signature" to signature), bytes))
        assertFalse(github.validSignature("key", mapOf("signature" to signature), bytes + 0))
        assertFalse(github.validSignature("key", emptyMap(), bytes))
        val gitlab = GitLabProvider("https://gitlab.com/api/v4")
        assertTrue(gitlab.validSignature("fixture-secret", mapOf("token" to "fixture-secret"), bytes))
        assertFalse(gitlab.validSignature("fixture-secret", mapOf("token" to "different-secret"), bytes))
    }
    @Test
    fun `encrypted credentials reject tampering and a different connection scope`() {
        val secret = ConnectionSecrets(Base64.getEncoder().encodeToString(ByteArray(32) { it.toByte() }))
        val cipher = secret.encrypt("unit-fixture-token", "project-1:token")
        assertEquals("unit-fixture-token", secret.decrypt(cipher, "project-1:token"))
        assertNotEquals(cipher, secret.encrypt("unit-fixture-token", "project-1:token"))
        assertFailsWith<AEADBadTagException> { secret.decrypt(cipher, "project-2:token") }
        val changed = Base64.getDecoder().decode(cipher).also { it[it.lastIndex] = (it.last().toInt() xor 1).toByte() }
        assertFailsWith<AEADBadTagException> { secret.decrypt(Base64.getEncoder().encodeToString(changed), "project-1:token") }
        assertFalse(ConnectionSecrets("").enabled)
    }
    @Test
    fun `provider events normalize merge state timestamps and trusted repository URLs`() {
        val repository = RepositoryInfo(101, "team/repo")
        val github = GitHubProvider("https://api.github.com").events("pull_request", """{"pull_request":{"number":7,"title":"ARC-1: merge","body":"ARC-2","state":"closed","merged":true,"updated_at":"2026-10-06T12:00:00Z","html_url":"https://untrusted.example/"}}""", repository).single()
        assertEquals("MERGED", github.state)
        assertEquals("https://github.com/team/repo/pull/7", github.url)
        val gitlab = GitLabProvider("https://gitlab.com/api/v4").events("Merge Request Hook", """{"object_attributes":{"iid":3,"title":"ARC-1","description":"ARC-2","state":"merged","updated_at":"2026-10-06 12:00:00 UTC"}}""", repository).single()
        assertEquals(Instant.parse("2026-10-06T12:00:00Z"), gitlab.updatedAt)
        assertEquals("https://gitlab.com/team/repo/-/merge_requests/3", gitlab.url)
    }
    @Test
    fun `provider lookup encodes repository paths and never follows an authenticated redirect`() {
        val requests = mutableListOf<String>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            val path = exchange.requestURI.rawPath
            requests += path
            val body: String
            val status: Int
            when (path) {
                "/repos/team/repo" -> { assertEquals("Bearer unit-fixture-token", exchange.requestHeaders.getFirst("Authorization")); status = 200; body = """{"id":101,"full_name":"team/repo"}""" }
                "/api/v4/projects/team%2Frepo" -> { assertEquals("unit-fixture-token", exchange.requestHeaders.getFirst("PRIVATE-TOKEN")); status = 200; body = """{"id":201,"path_with_namespace":"team/repo"}""" }
                "/repos/redirect/repo" -> { status = 302; body = ""; exchange.responseHeaders.add("Location", "http://127.0.0.1:${server.address.port}/leak") }
                else -> { status = 403; body = "{}" }
            }
            exchange.sendResponseHeaders(status, body.toByteArray().size.toLong())
            exchange.responseBody.use { it.write(body.toByteArray()) }
        }
        server.start()
        try {
            val base = "http://127.0.0.1:${server.address.port}"
            assertEquals(101L, GitHubProvider(base).lookup("unit-fixture-token", "team/repo").id)
            assertEquals(201L, GitLabProvider("$base/api/v4").lookup("unit-fixture-token", "team/repo").id)
            val error = assertFailsWith<ApiError> { GitHubProvider(base).lookup("unit-fixture-token", "redirect/repo") }
            assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.status)
            assertFalse(requests.any { it == "/leak" })
        } finally { server.stop(0) }
    }
}
