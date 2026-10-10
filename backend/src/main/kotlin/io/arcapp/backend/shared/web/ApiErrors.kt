package io.arcapp.backend.shared.web

import io.arcapp.backend.shared.api.ApiError
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ApiError::class)
    fun known(error: ApiError): ResponseEntity<Map<String, Any>> = ResponseEntity.status(error.status).body(
        buildMap {
            put("error", error.message)
            error.code?.let { put("code", it) }
            if (error.fieldErrors.isNotEmpty()) put("fieldErrors", error.fieldErrors)
        },
    )

    @ExceptionHandler(org.springframework.dao.DuplicateKeyException::class)
    fun duplicate(): ResponseEntity<Map<String, String>> = ResponseEntity.status(HttpStatus.CONFLICT).body(mapOf("error" to "이미 존재하는 항목입니다."))

    @ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException::class)
    fun invalid(error: org.springframework.web.bind.MethodArgumentNotValidException): ResponseEntity<Map<String, Any>> = ResponseEntity.badRequest().body(
        mapOf("error" to "입력값을 확인해 주세요.", "code" to "VALIDATION_FAILED",
            "fieldErrors" to error.bindingResult.fieldErrors.associate { it.field to (it.defaultMessage ?: "입력값을 확인해 주세요.") }),
    )

    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException::class)
    fun unreadable(): ResponseEntity<Map<String, String>> = ResponseEntity.badRequest().body(
        mapOf("error" to "입력값의 형식과 필수 항목을 확인해 주세요.", "code" to "INVALID_REQUEST"),
    )
}
