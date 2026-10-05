package io.arcapp.backend.shared.web

import io.arcapp.backend.shared.api.ApiError
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus

fun HttpServletRequest.userId(): Long = (getAttribute("arcUserId") as? Long)
    ?: throw ApiError(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.")
