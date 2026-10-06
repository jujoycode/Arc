package io.arcapp.backend.integration.internal

import io.arcapp.backend.integration.api.*
import io.arcapp.backend.integration.internal.persistence.*
import io.arcapp.backend.issue.api.IssueDevelopmentQueries
import io.arcapp.backend.project.api.ProjectAccess
import io.arcapp.backend.shared.api.ApiError
import io.arcapp.backend.workspace.api.WorkspaceAccess
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

internal data class ConnectionInput(val provider: ProviderKind, val repository: String, val token: String, val webhookSecret: String)
internal class DeliveryFailure(val deliveryId: Long, val failureType: String) : RuntimeException("Webhook processing failed")

@Service
internal class IntegrationService(
    private val repository: IntegrationRepository,
    private val projects: ProjectAccess,
    private val workspaces: WorkspaceAccess,
    private val issues: IssueDevelopmentQueries,
    private val secrets: ConnectionSecrets,
    providers: List<RepositoryProvider>,
    transactions: PlatformTransactionManager,
    @Value("\${arc.public-url}") private val publicUrl: String,
) {
    private val providers = providers.associateBy { it.kind }
    private val writes = TransactionTemplate(transactions)
    private val references = Regex("(?<![A-Za-z0-9_-])([A-Z][A-Z0-9]{1,9})-([1-9][0-9]{0,9})(?![A-Za-z0-9_-])")
    private fun slugValid(value: String, kind: ProviderKind): Boolean {
        val parts = value.split('/')
        return value.length <= 240 && parts.size >= 2 && (kind != ProviderKind.GITHUB || parts.size == 2) && parts.all { it !in setOf(".", "..") && it.matches(Regex("[A-Za-z0-9_.-]+")) }
    }
    private fun manager(actorId: Long, projectId: Long, lock: Boolean = false, active: Boolean = true) {
        val project = if (lock) projects.forUpdate(projectId, actorId) else projects.get(projectId, actorId)
        if (active) project.requireActive()
        workspaces.requireManager(project.workspaceId, actorId)
    }
    private fun connection(projectId: Long, id: Long): Connection = repository.find(id)?.takeIf { it.projectId == projectId }
        ?: throw ApiError(HttpStatus.NOT_FOUND, "저장소 연결이 없습니다.")
    private fun enabled() { if (!secrets.enabled) throw ApiError(HttpStatus.SERVICE_UNAVAILABLE, "서버의 저장소 연동 설정이 필요합니다.") }
    private fun view(connection: Connection) = mapOf("id" to connection.id, "provider" to connection.provider.name, "repository" to connection.repository.slug, "status" to connection.status, "webhookUrl" to "${publicUrl.trimEnd('/')}/api/integrations/webhooks/${connection.id}")
    fun list(actorId: Long, projectId: Long): Map<String, Any> {
        projects.get(projectId, actorId)
        return mapOf("enabled" to secrets.enabled, "items" to repository.list(projectId).map(::view))
    }
    fun connect(actorId: Long, projectId: Long, input: ConnectionInput): Map<String, Long> {
        manager(actorId, projectId); enabled()
        val slug = input.repository.trim()
        if (!slugValid(slug, input.provider) || input.token.length !in 8..4096 || input.token.any(Char::isWhitespace) || !input.webhookSecret.matches(Regex("[A-Za-z0-9_-]{32,256}"))) throw ApiError(HttpStatus.BAD_REQUEST, "저장소 경로·토큰·32자 이상의 웹훅 검증키를 확인하세요.")
        // Provider I/O is outside the database transaction and project lock.
        val info = providers.getValue(input.provider).lookup(input.token, slug)
        if (info.id <= 0 || !slugValid(info.slug, input.provider)) throw ApiError(HttpStatus.SERVICE_UNAVAILABLE, "저장소 정보를 확인할 수 없습니다.")
        val context = "$projectId:${input.provider}:${info.id}"
        val id = writes.execute {
            manager(actorId, projectId, true)
            repository.save(projectId, input.provider, info, secrets.encrypt(input.token, "$context:token"), secrets.encrypt(input.webhookSecret, "$context:secret"))
        }!!
        return mapOf("id" to id)
    }
    fun recheck(actorId: Long, projectId: Long, id: Long): Map<String, String> {
        manager(actorId, projectId); enabled()
        val connection = connection(projectId, id)
        if (connection.status == "DISCONNECTED") throw ApiError(HttpStatus.CONFLICT, "해제한 저장소는 다시 연결하세요.")
        val info = try { providers.getValue(connection.provider).recheck(secrets.decrypt(checkNotNull(connection.token), connection.context("token")), connection.repository.id) }
        catch (error: ApiError) {
            if (error.status != HttpStatus.BAD_REQUEST) throw error
            writes.execute {
                manager(actorId, projectId, true)
                if (connection(projectId, id).token != connection.token) throw ApiError(HttpStatus.CONFLICT, "연결이 변경되었습니다. 다시 확인하세요.")
                repository.status(id, "DISABLED")
            }
            return mapOf("status" to "DISABLED")
        }
        if (info.id != connection.repository.id || !slugValid(info.slug, connection.provider)) throw ApiError(HttpStatus.SERVICE_UNAVAILABLE, "저장소 정보를 확인할 수 없습니다.")
        writes.execute {
            manager(actorId, projectId, true)
            if (connection(projectId, id).token != connection.token) throw ApiError(HttpStatus.CONFLICT, "연결이 변경되었습니다. 다시 확인하세요.")
            repository.status(id, "ACTIVE", info.slug)
        }
        return mapOf("status" to "ACTIVE")
    }
    @Transactional
    fun disconnect(actorId: Long, projectId: Long, id: Long) { manager(actorId, projectId, true); connection(projectId, id); repository.status(id, "DISCONNECTED") }
    fun deliveries(actorId: Long, projectId: Long, id: Long): List<Map<String, Any?>> { manager(actorId, projectId, active = false); connection(projectId, id); return repository.deliveries(id) }
    @Transactional
    fun retry(actorId: Long, projectId: Long, id: Long, deliveryId: Long) {
        manager(actorId, projectId, true)
        if (connection(projectId, id).status != "ACTIVE") throw ApiError(HttpStatus.CONFLICT, "활성 연결에서 다시 시도하세요.")
        if (repository.retry(id, deliveryId) == 0) throw ApiError(HttpStatus.NOT_FOUND, "실패한 전달 기록이 없습니다.")
    }
    fun links(actorId: Long, projectId: Long, issueId: Long): List<Map<String, Any?>> {
        projects.get(projectId, actorId)
        if (!issues.contains(projectId, issueId)) throw ApiError(HttpStatus.NOT_FOUND, "이슈가 없습니다.")
        return repository.links(issueId)
    }
    @Transactional
    fun receive(id: Long, headers: Map<String, String>, bytes: ByteArray): Map<String, Boolean> {
        enabled()
        if (bytes.size > 1048576) throw ApiError(HttpStatus.PAYLOAD_TOO_LARGE, "웹훅 크기가 제한을 초과했습니다.")
        val connection = repository.find(id) ?: throw ApiError(HttpStatus.NOT_FOUND, "연결이 없습니다.")
        if (connection.status != "ACTIVE") throw ApiError(HttpStatus.GONE, "비활성 연결입니다.")
        val provider = providers.getValue(connection.provider)
        val secret = secrets.decrypt(checkNotNull(connection.secret), connection.context("secret"))
        if (!provider.validSignature(secret, headers, bytes)) throw ApiError(HttpStatus.UNAUTHORIZED, "웹훅 검증에 실패했습니다.")
        val deliveryId = headers["delivery"].orEmpty()
        val event = headers["event"].orEmpty()
        if (!deliveryId.matches(Regex("[A-Za-z0-9._:-]{1,128}")) || event.isBlank() || event.length > 64) throw ApiError(HttpStatus.BAD_REQUEST, "전달 ID와 이벤트 종류가 필요합니다.")
        val body = try { Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString() }
        catch (_: Exception) { throw ApiError(HttpStatus.BAD_REQUEST, "웹훅 본문을 확인하세요.") }
        val repositoryId = try { provider.repositoryId(body) } catch (_: Exception) { throw ApiError(HttpStatus.BAD_REQUEST, "웹훅 본문을 확인하세요.") }
        if (repositoryId != connection.repository.id) throw ApiError(HttpStatus.BAD_REQUEST, "연결한 저장소의 이벤트가 아닙니다.")
        return mapOf("accepted" to repository.enqueue(id, deliveryId, event, body))
    }
    @Transactional
    fun processNext(): Boolean {
        val delivery = repository.next() ?: return false
        try {
            val connection = repository.find(delivery.connectionId)
            val key = connection?.takeIf { it.status == "ACTIVE" }?.let { projects.externalKey(it.projectId) }
            if (connection != null && key != null) {
                for (event in providers.getValue(connection.provider).events(delivery.event, delivery.payload, connection.repository)) {
                    val numbers = references.findAll(event.title + "\n" + event.body).filter { it.groupValues[1] == key }.mapNotNull { it.groupValues[2].toIntOrNull() }.toSet()
                    for (issueId in issues.findNumbers(connection.projectId, numbers).values) repository.link(issueId, connection.id, event)
                }
            }
            repository.complete(delivery.id)
        } catch (error: Exception) { throw DeliveryFailure(delivery.id, error.javaClass.simpleName) }
        return true
    }
    @Transactional
    fun markFailed(id: Long) = repository.failed(id)
}
