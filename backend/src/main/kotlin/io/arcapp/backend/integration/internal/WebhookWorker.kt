package io.arcapp.backend.integration.internal

import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.slf4j.LoggerFactory

@Component
internal class WebhookWorker(private val service: IntegrationService) {
    private val log = LoggerFactory.getLogger(javaClass)
    @Scheduled(fixedDelayString = "\${arc.integrations.poll-interval:2000}")
    fun poll() {
        repeat(20) {
            try { if (!service.processNext()) return }
            catch (failure: DeliveryFailure) { log.warn("Webhook delivery {} failed ({})", failure.deliveryId, failure.failureType); service.markFailed(failure.deliveryId) }
        }
    }
}
