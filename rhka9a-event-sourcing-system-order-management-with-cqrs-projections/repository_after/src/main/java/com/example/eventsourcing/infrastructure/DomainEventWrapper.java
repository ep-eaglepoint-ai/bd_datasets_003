package com.example.eventsourcing.infrastructure;

import com.example.eventsourcing.domain.DomainEvent;
import org.springframework.context.ApplicationEvent;

/**
 * Wrapper for domain events to be published through Spring's application event publisher.
 */
public class DomainEventWrapper extends ApplicationEvent {
    
    private final DomainEvent domainEvent;
    
    public DomainEventWrapper(Object source, DomainEvent domainEvent) {
        super(source);
        this.domainEvent = domainEvent;
    }
    
    public DomainEvent getDomainEvent() {
        return domainEvent;
    }
    
    @Override
    public String toString() {
        return "DomainEventWrapper{" +
               "domainEvent=" + domainEvent +
               '}';
    }
}
