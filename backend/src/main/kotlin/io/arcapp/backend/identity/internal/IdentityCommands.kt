package io.arcapp.backend.identity.internal

data class RegisterInput(val email: String, val displayName: String, val password: String)
data class LoginInput(val email: String, val password: String)
