package io.arcapp.backend.shared.web

import io.arcapp.backend.shared.api.ApiError
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ApiError::class)
    fun known(error: ApiError): ResponseEntity<Map<String, String>> = ResponseEntity.status(error.status).body(mapOf("error" to error.message))

    @ExceptionHandler(org.springframework.dao.DuplicateKeyException::class)
    fun duplicate(): ResponseEntity<Map<String, String>> = ResponseEntity.status(HttpStatus.CONFLICT).body(mapOf("error" to "이미 존재하는 항목입니다."))

    @ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException::class)
    fun invalid(): ResponseEntity<Map<String, String>> = ResponseEntity.badRequest().body(mapOf("error" to "입력값을 확인해 주세요."))
}
