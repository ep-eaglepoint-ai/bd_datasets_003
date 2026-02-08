package com.example.eventsourcing.infrastructure;

import com.example.eventsourcing.domain.DomainEvent;

/**
 * Wrapper for domain events to be published via Spring's event system.
 */
public class DomainEventWrapper<T extends DomainEvent> {
    
    private final T event;
    
    public DomainEventWrapper(T event) {
        this.event = event;
    }
    
    public T getEvent() {
        return event;
    }
}

