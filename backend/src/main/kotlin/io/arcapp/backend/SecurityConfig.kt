package io.arcapp.backend

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.filter.OncePerRequestFilter

@Configuration
class SecurityConfig(private val jdbc: JdbcTemplate) {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain = http
        .csrf { it.disable() }
        .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
        .authorizeHttpRequests { it.anyRequest().permitAll() }
        .addFilterBefore(BearerFilter(jdbc), org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter::class.java)
        .build()
}

class BearerFilter(private val jdbc: JdbcTemplate) : OncePerRequestFilter() {
    override fun shouldNotFilter(request: HttpServletRequest): Boolean =
        !request.requestURI.startsWith("/api/") || request.requestURI in setOf(
            "/api/auth/register", "/api/auth/verify", "/api/auth/login"
        )

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val raw = request.getHeader("Authorization")?.takeIf { it.startsWith("Bearer ") }?.removePrefix("Bearer ")
        val userId = raw?.let { token ->
            jdbc.query(
                "SELECT t.user_id FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.purpose='SESSION' AND t.used_at IS NULL AND t.expires_at>UTC_TIMESTAMP(6) AND u.email_verified_at IS NOT NULL",
                { rs, _ -> rs.getLong(1) }, sha256(token)
            ).firstOrNull()
        }
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
