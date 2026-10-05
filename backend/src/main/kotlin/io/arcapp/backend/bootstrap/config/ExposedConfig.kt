package io.arcapp.backend.bootstrap.config

import javax.sql.DataSource
import org.jetbrains.exposed.v1.spring.transaction.SpringTransactionManager
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class ExposedConfig {
    @Bean
    fun transactionManager(dataSource: DataSource): SpringTransactionManager = SpringTransactionManager(dataSource)
}
