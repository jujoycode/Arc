package io.arcapp.backend.integration.internal.client

import io.arcapp.backend.shared.api.ApiError
import org.springframework.http.HttpStatus
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

internal val providerJson = JsonMapper.builder().build()
private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build()
internal fun providerBase(value: String): String {
    val uri = URI(value)
    require(uri.scheme == "https" || uri.scheme == "http" && uri.host in setOf("localhost", "127.0.0.1")) { "Provider API must use HTTPS, or loopback HTTP for a fixture" }
    require(uri.userInfo == null && uri.query == null && uri.fragment == null)
    return value.trimEnd('/')
}
internal fun providerGet(base: String, path: String, token: String, github: Boolean): JsonNode {
    val request = HttpRequest.newBuilder(URI(base + path)).timeout(Duration.ofSeconds(8))
        .header("Accept", "application/json")
        .header("User-Agent", "arcat")
        .header(if (github) "Authorization" else "PRIVATE-TOKEN", if (github) "Bearer $token" else token).GET().build()
    val response = try { http.send(request, HttpResponse.BodyHandlers.ofString()) }
    catch (_: Exception) { throw ApiError(HttpStatus.SERVICE_UNAVAILABLE, "저장소 제공자에 연결할 수 없습니다. 잠시 후 다시 확인하세요.") }
    if (response.statusCode() in setOf(401, 403, 404)) throw ApiError(HttpStatus.BAD_REQUEST, "저장소 경로와 토큰의 읽기 권한을 확인하세요.")
    if (response.statusCode() != 200) throw ApiError(HttpStatus.SERVICE_UNAVAILABLE, "저장소 제공자가 요청을 처리하지 못했습니다.")
    return try { providerJson.readTree(response.body()) } catch (_: Exception) { throw ApiError(HttpStatus.SERVICE_UNAVAILABLE, "저장소 응답을 확인할 수 없습니다.") }
}
