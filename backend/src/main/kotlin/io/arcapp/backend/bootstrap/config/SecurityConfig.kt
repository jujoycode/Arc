package io.arcapp.backend.bootstrap.config

import io.arcapp.backend.identity.api.SessionAuthenticator

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.filter.OncePerRequestFilter

@Configuration
class SecurityConfig(private val sessions: SessionAuthenticator) {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain = http
        .csrf { it.disable() }
        .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
        .authorizeHttpRequests { it.anyRequest().permitAll() }
        .addFilterBefore(BearerFilter(sessions), org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter::class.java)
        .build()
}

class BearerFilter(private val sessions: SessionAuthenticator) : OncePerRequestFilter() {
    override fun shouldNotFilter(request: HttpServletRequest): Boolean =
        !request.requestURI.startsWith("/api/") || request.requestURI.startsWith("/api/integrations/webhooks/") || request.requestURI in setOf(
            "/api/auth/register", "/api/auth/verify", "/api/auth/login"
        )

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val raw = request.getHeader("Authorization")?.takeIf { it.startsWith("Bearer ") }?.removePrefix("Bearer ")
        val userId = raw?.let(sessions::authenticate)
        if (userId == null) {
            response.status = 401
            response.contentType = "application/json;charset=UTF-8"
            response.writer.write("{\"error\":\"로그인이 필요합니다.\"}")
            return
        }
        request.setAttribute("arcUserId", userId)
        chain.doFilter(request, response)
    }
}
