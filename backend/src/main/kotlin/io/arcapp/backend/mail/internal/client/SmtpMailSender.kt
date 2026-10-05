package io.arcapp.backend.mail.internal.client

import io.arcapp.backend.mail.api.MailSender
import org.springframework.beans.factory.annotation.Value
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.stereotype.Component

@Component
class SmtpMailSender(
    private val mail: JavaMailSender,
    @Value("\${arc.mail-from}") private val fromAddress: String,
) : MailSender {
    override fun send(to: String, subject: String, body: String) {
        val message = SimpleMailMessage()
        message.setFrom(fromAddress)
        message.setTo(to)
        message.subject = subject
        message.text = body
        mail.send(message)
    }
}
