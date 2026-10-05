package io.arcapp.backend.shared.api

import org.springframework.http.HttpStatus

class ApiError(val status: HttpStatus, override val message: String) : RuntimeException(message)
