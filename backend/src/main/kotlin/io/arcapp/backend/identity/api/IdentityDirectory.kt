package io.arcapp.backend.identity.api

import io.arcapp.backend.identity.internal.persistence.IdentityRepository
import io.arcapp.backend.shared.api.ApiError
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

@Service
class IdentityDirectory(private val repository: IdentityRepository) {
    fun emailOf(userId: Long): String = repository.user(userId)?.get("email") as? String
        ?: throw ApiError(HttpStatus.NOT_FOUND, "사용자가 없습니다.")
}
