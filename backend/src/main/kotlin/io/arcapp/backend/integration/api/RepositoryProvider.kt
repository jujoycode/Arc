package io.arcapp.backend.integration.api

enum class ProviderKind { GITHUB, GITLAB }
data class RepositoryInfo(val id: Long, val slug: String)
data class DevelopmentEvent(val externalId: String, val kind: String, val title: String, val body: String, val state: String, val url: String, val updatedAt: java.time.Instant?)

/** Provider HTTP and signature boundary; application services consume normalized events. */
interface RepositoryProvider {
    val kind: ProviderKind
    fun lookup(token: String, slug: String): RepositoryInfo
    fun recheck(token: String, id: Long): RepositoryInfo
    fun validSignature(secret: String, headers: Map<String, String>, body: ByteArray): Boolean
    fun repositoryId(body: String): Long
    fun events(event: String, body: String, repository: RepositoryInfo): List<DevelopmentEvent>
}
