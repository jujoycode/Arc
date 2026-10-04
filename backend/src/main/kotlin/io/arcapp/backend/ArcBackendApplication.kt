package io.arcapp.backend

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration

@SpringBootApplication(exclude = [UserDetailsServiceAutoConfiguration::class])
class ArcBackendApplication

fun main(args: Array<String>) {
	runApplication<ArcBackendApplication>(*args)
}
