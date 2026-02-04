package com.audit.engine.event;

import com.audit.engine.spi.AuditStorage;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
public class AuditLogListener {

    private final AuditStorage auditStorage;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handleAuditLogEvent(AuditLogEvent event) {
        System.out.println("AuditLogListener: Saving log");
        auditStorage.save(event.getAuditLog());
    }
}
