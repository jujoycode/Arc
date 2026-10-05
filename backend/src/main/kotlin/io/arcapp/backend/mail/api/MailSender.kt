package io.arcapp.backend.mail.api

interface MailSender {
    fun send(to: String, subject: String, body: String)
}
