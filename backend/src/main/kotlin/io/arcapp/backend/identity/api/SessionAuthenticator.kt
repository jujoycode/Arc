package io.arcapp.backend.identity.api

import io.arcapp.backend.identity.internal.persistence.IdentityRepository
import io.arcapp.backend.shared.security.sha256
import org.springframework.stereotype.Service

@Service
class SessionAuthenticator(private val repository: IdentityRepository) {
    fun authenticate(token: String): Long? = repository.sessionUser(sha256(token))
}
