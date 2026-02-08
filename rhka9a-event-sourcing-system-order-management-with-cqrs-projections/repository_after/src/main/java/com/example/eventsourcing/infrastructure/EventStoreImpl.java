package com.example.eventsourcing.infrastructure;

import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.exception.ConcurrencyException;
import com.example.eventsourcing.exception.EventDeserializationException;
import com.example.eventsourcing.exception.EventSerializationException;
import com.example.eventsourcing.infrastructure.persistence.EventEntity;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Spliterator;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

/**
 * Implementation of EventStore with optimistic locking.
 */
@Service
@Transactional
public class EventStoreImpl implements EventStore {
    
    private static final Logger log = LoggerFactory.getLogger(EventStoreImpl.class);
    
    @Autowired
    private EventRepository eventRepository;
    
    @Autowired
    private ObjectMapper objectMapper;
    
    @Autowired
    private ApplicationEventPublisher eventPublisher;
    
    @Override
    public void appendEvents(UUID aggregateId, String aggregateType, Long expectedVersion, List<DomainEvent> events) {
        if (events == null || events.isEmpty()) {
            return;
        }
        
        // 1. Verify optimistic lock
        Long currentVersion = getLatestVersion(aggregateId);
        if (!Objects.equals(currentVersion, expectedVersion)) {
            throw new ConcurrencyException(
                String.format("Expected version %d but found %d for aggregate %s",
                    expectedVersion, currentVersion, aggregateId));
        }
        
        // 2. Persist events with sequential versions
        Long nextVersion = currentVersion + 1;
        for (DomainEvent event : events) {
            EventEntity entity = new EventEntity();
            entity.setEventId(UUID.randomUUID());
            entity.setAggregateId(aggregateId);
            entity.setAggregateType(aggregateType);
            entity.setEventVersion(nextVersion++);
            entity.setEventType(event.getClass().getName());
            entity.setEventPayload(serializeEvent(event));
            entity.setCreatedAt(Instant.now());
            
            try {
                eventRepository.save(entity);
            } catch (DataIntegrityViolationException e) {
                // Unique constraint violation on (aggregate_id, event_version)
                throw new ConcurrencyException(
                    "Concurrent modification detected for aggregate: " + aggregateId, e);
            }
        }
        
        // 3. Publish events (handlers will fire after commit via @TransactionalEventListener)
        // Events are published inside transaction, handlers fire after transaction commits
        events.forEach(event -> eventPublisher.publishEvent(new DomainEventWrapper<>(event)));
        
        log.debug("Appended {} events for aggregate {} (handlers will fire after commit)", events.size(), aggregateId);
    }
    
    @Override
    @Transactional(readOnly = true)
    public List<DomainEvent> getEvents(UUID aggregateId) {
        return eventRepository.findByAggregateIdOrderByEventVersionAsc(aggregateId)
            .stream()
            .map(this::deserializeEvent)
            .toList();
    }
    
    @Override
    @Transactional(readOnly = true)
    public List<DomainEvent> getEventsAfterVersion(UUID aggregateId, Long afterVersion) {
        return eventRepository
            .findByAggregateIdAndEventVersionGreaterThanOrderByEventVersionAsc(aggregateId, afterVersion)
            .stream()
            .map(this::deserializeEvent)
            .toList();
    }
    
    @Override
    @Transactional(readOnly = true)
    public Long getLatestVersion(UUID aggregateId) {
        return eventRepository.findMaxVersionByAggregateId(aggregateId)
            .orElse(0L);
    }
    
    @Override
    @Transactional(readOnly = true)
    public Stream<DomainEvent> streamAllEvents(int batchSize) {
        // Stream all events in batches to avoid loading everything into memory
        // Use pagination to iterate through all events
        return StreamSupport.stream(new Spliterator<DomainEvent>() {
            private int currentPage = 0;
            private Page<EventEntity> currentPageResult = null;
            private int currentIndex = 0;
            
            @Override
            public boolean tryAdvance(Consumer<? super DomainEvent> action) {
                if (currentPageResult == null || currentIndex >= currentPageResult.getContent().size()) {
                    // Load next page
                    currentPageResult = eventRepository.findAllByOrderByCreatedAtAsc(PageRequest.of(currentPage, batchSize));
                    if (currentPageResult.isEmpty()) {
                        return false; // No more events
                    }
                    currentPage++;
                    currentIndex = 0;
                }
                
                EventEntity entity = currentPageResult.getContent().get(currentIndex++);
                action.accept(deserializeEvent(entity));
                return true;
            }
            
            @Override
            public Spliterator<DomainEvent> trySplit() {
                return null; // Sequential processing
            }
            
            @Override
            public long estimateSize() {
                return Long.MAX_VALUE; // Unknown size
            }
            
            @Override
            public int characteristics() {
                return ORDERED | NONNULL;
            }
        }, false);
    }
    
    /**
     * Serialize event to JSON.
     */
    private String serializeEvent(DomainEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException e) {
            throw new EventSerializationException("Failed to serialize event: " + event.getClass().getName(), e);
        }
    }
    
    /**
     * Deserialize event from JSON.
     */
    private DomainEvent deserializeEvent(EventEntity entity) {
        try {
            Class<?> eventClass = Class.forName(entity.getEventType());
            return (DomainEvent) objectMapper.readValue(entity.getEventPayload(), eventClass);
        } catch (Exception e) {
            throw new EventDeserializationException(
                "Failed to deserialize event: " + entity.getEventId(), e);
        }
    }
}

