package com.audit.engine.spi;

import com.audit.engine.model.AuditLog;

public interface AuditStorage {
    void save(AuditLog auditLog);
}
