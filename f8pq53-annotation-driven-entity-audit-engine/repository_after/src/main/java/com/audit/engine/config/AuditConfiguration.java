package com.audit.engine.config;

import com.audit.engine.repo.AuditLogRepository;
import com.audit.engine.spi.AuditStorage;
import com.audit.engine.spi.impl.DatabaseAuditStorage;
import com.audit.engine.spi.impl.FileAuditStorage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AuditConfiguration {

    @Bean
    @ConditionalOnProperty(name = "audit.storage.type", havingValue = "database")
    public AuditStorage databaseAuditStorage(AuditLogRepository repository) {
        return new DatabaseAuditStorage(repository);
    }

    @Bean
    @ConditionalOnProperty(name = "audit.storage.type", havingValue = "file", matchIfMissing = true)
    public AuditStorage fileAuditStorage(@Value("${audit.storage.file.path:audit_logs.json}") String filePath) {
        return new FileAuditStorage(filePath);
    }
}
