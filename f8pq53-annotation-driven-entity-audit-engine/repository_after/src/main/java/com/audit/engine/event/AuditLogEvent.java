package com.audit.engine.event;

import com.audit.engine.model.AuditLog;
import org.springframework.context.ApplicationEvent;

public class AuditLogEvent extends ApplicationEvent {

    private final AuditLog auditLog;

    public AuditLogEvent(Object source, AuditLog auditLog) {
        super(source);
        this.auditLog = auditLog;
    }

    public AuditLog getAuditLog() {
        return auditLog;
    }
}
