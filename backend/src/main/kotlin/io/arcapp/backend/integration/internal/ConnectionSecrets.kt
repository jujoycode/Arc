package io.arcapp.backend.integration.internal

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

@Component
class ConnectionSecrets(@Value("\${arc.integrations.encryption-key:}") encodedKey: String) {
    private val key = encodedKey.takeIf(String::isNotBlank)?.let {
        val bytes = try { Base64.getDecoder().decode(it) } catch (_: IllegalArgumentException) { error("ARC_INTEGRATION_ENCRYPTION_KEY must encode 32 bytes") }
        require(bytes.size == 32) { "ARC_INTEGRATION_ENCRYPTION_KEY must encode 32 bytes" }
        SecretKeySpec(bytes, "AES")
    }
    private val random = SecureRandom()
    val enabled get() = key != null
    fun encrypt(value: String, context: String): String {
        val nonce = ByteArray(12).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, checkNotNull(key), GCMParameterSpec(128, nonce))
        cipher.updateAAD(context.toByteArray(Charsets.UTF_8))
        return Base64.getEncoder().encodeToString(nonce + cipher.doFinal(value.toByteArray(Charsets.UTF_8)))
    }
    fun decrypt(value: String, context: String): String {
        val bytes = Base64.getDecoder().decode(value)
        require(bytes.size >= 28)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, checkNotNull(key), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        cipher.updateAAD(context.toByteArray(Charsets.UTF_8))
        return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
    }
}
