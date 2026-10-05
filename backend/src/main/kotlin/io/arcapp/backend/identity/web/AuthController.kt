package io.arcapp.backend.identity.web

import io.arcapp.backend.identity.internal.IdentityService
import io.arcapp.backend.identity.internal.LoginInput
import io.arcapp.backend.identity.internal.RegisterInput
import io.arcapp.backend.shared.web.userId
import jakarta.servlet.http.HttpServletRequest
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/auth")
class AuthController(private val service: IdentityService) {
    @PostMapping("/register") fun register(@RequestBody input: RegisterInput) = service.register(input)
    @PostMapping("/verify") fun verify(@RequestParam token: String) = service.verify(token)
    @PostMapping("/login") fun login(@RequestBody input: LoginInput) = service.login(input)
    @PostMapping("/logout") fun logout(request: HttpServletRequest) = service.logout(request.userId(), request.getHeader("Authorization").removePrefix("Bearer "))
    @GetMapping("/me") fun me(request: HttpServletRequest) = service.me(request.userId())
}
