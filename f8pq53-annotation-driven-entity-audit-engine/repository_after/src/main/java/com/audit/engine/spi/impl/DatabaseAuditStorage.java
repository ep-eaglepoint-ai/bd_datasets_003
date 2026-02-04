package com.audit.engine.spi.impl;

import com.audit.engine.model.AuditLog;
import com.audit.engine.repo.AuditLogRepository;
import com.audit.engine.spi.AuditStorage;
import lombok.RequiredArgsConstructor;

// Not making it @Component immediately, will configure via Bean
@RequiredArgsConstructor
public class DatabaseAuditStorage implements AuditStorage {

    private final AuditLogRepository repository;

    @Override
    public void save(AuditLog auditLog) {
        repository.save(auditLog);
    }
}
