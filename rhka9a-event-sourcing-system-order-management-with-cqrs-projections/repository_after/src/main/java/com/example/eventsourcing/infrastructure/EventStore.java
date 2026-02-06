package com.example.eventsourcing.infrastructure;

import com.example.eventsourcing.config.EventSourcingProperties;
import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.exception.ConcurrencyException;
import com.example.eventsourcing.infrastructure.persistence.EventEntity;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Service for storing and retrieving domain events with optimistic locking.
 */
@Service
public class EventStore {
    
    private static final Logger logger = LoggerFactory.getLogger(EventStore.class);
    
    private final EventRepository eventRepository;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;
    private final EventSourcingProperties properties;
    
    public EventStore(EventRepository eventRepository, ObjectMapper objectMapper,
                      ApplicationEventPublisher eventPublisher,
                      EventSourcingProperties properties) {
        this.eventRepository = eventRepository;
        this.objectMapper = objectMapper;
        this.eventPublisher = eventPublisher;
        this.properties = properties;
    }
    
    /**
     * Append events to the event store with optimistic locking.
     * 
     * @param aggregateId The ID of the aggregate
     * @param expectedVersion The version expected when saving (for optimistic locking)
     * @param events The list of uncommitted events to save
     * @return The list of saved events with their persisted versions
     * @throws ConcurrencyException if another transaction has modified the aggregate
     */
    @Transactional
    public List<DomainEvent> appendEvents(String aggregateId, Long expectedVersion, 
                                          List<? extends DomainEvent> events) {
        logger.debug("Appending {} events for aggregate {} with expected version {}",
                events.size(), aggregateId, expectedVersion);
        
        // Verify the current version matches the expected version
        Long currentVersion = eventRepository.getCurrentVersion(aggregateId);
        if (!currentVersion.equals(expectedVersion)) {
            throw new ConcurrencyException(aggregateId, expectedVersion, currentVersion);
        }
        
        List<DomainEvent> savedEvents = new ArrayList<>();
        long nextVersion = expectedVersion + 1;
        
        for (DomainEvent event : events) {
            // Ensure the event version matches the expected next version
            DomainEvent eventWithVersion = ensureEventVersion(event, nextVersion);
            
            // Serialize and persist the event
            EventEntity entity = toEntity(eventWithVersion);
            try {
                eventRepository.save(entity);
                eventRepository.flush(); // Force immediate execution to catch constraint violations
            } catch (DataIntegrityViolationException e) {
                // Database constraint violation means another transaction already saved this version
                // Cannot query DB here - PostgreSQL has aborted the transaction
                // The actual version must be > expectedVersion (concurrent write occurred)
                throw new ConcurrencyException(aggregateId, expectedVersion, expectedVersion + 1, e);
            }
            
            savedEvents.add(eventWithVersion);
            nextVersion++;
            
            logger.debug("Saved event {} for aggregate {} with version {}",
                    event.getEventId(), aggregateId, eventWithVersion.getVersion());
        }
        
        logger.info("Successfully appended {} events for aggregate {}", events.size(), aggregateId);
        return savedEvents;
    }
    
    /**
     * Append the first event for a new aggregate.
     * Uses optimistic locking by verifying the aggregate has no existing events (version == 0).
     */
    @Transactional
    public DomainEvent appendInitialEvent(String aggregateId, DomainEvent event) {
        logger.debug("Appending initial event for aggregate {}", aggregateId);
        
        // Verify the aggregate has no existing events (optimistic locking for new aggregates)
        Long currentVersion = eventRepository.getCurrentVersion(aggregateId);
        if (!currentVersion.equals(0L)) {
            throw new ConcurrencyException(aggregateId, 0L, currentVersion);
        }
        
        EventEntity entity = toEntity(event);
        try {
            eventRepository.save(entity);
            eventRepository.flush(); // Force immediate execution to catch constraint violations
        } catch (DataIntegrityViolationException e) {
            // Database constraint violation means another transaction already created this aggregate
            // Cannot query DB here - PostgreSQL has aborted the transaction
            // The actual version must be at least 1 (initial event exists)
            throw new ConcurrencyException(aggregateId, 0L, 1L, e);
        }
        logger.info("Saved initial event {} for aggregate {}", event.getEventId(), aggregateId);
        return event;
    }
    
    /**
     * Load all events for an aggregate.
     */
    @Transactional(readOnly = true)
    public List<DomainEvent> loadEvents(String aggregateId) {
        logger.debug("Loading events for aggregate {}", aggregateId);
        List<EventEntity> entities = eventRepository.findByAggregateIdOrderByVersionAsc(aggregateId);
        return entities.stream()
                .map(this::fromEntity)
                .collect(Collectors.toList());
    }
    
    /**
     * Load events for an aggregate after a specific version.
     */
    @Transactional(readOnly = true)
    public List<DomainEvent> loadEventsAfterVersion(String aggregateId, Long version) {
        logger.debug("Loading events for aggregate {} after version {}", aggregateId, version);
        List<EventEntity> entities = eventRepository
                .findByAggregateIdAndVersionGreaterThanOrderByVersionAsc(aggregateId, version);
        return entities.stream()
                .map(this::fromEntity)
                .collect(Collectors.toList());
    }
    
    /**
     * Get the current version of an aggregate.
     */
    @Transactional(readOnly = true)
    public Long getCurrentVersion(String aggregateId) {
        return eventRepository.getCurrentVersion(aggregateId);
    }
    
    /**
     * Check if an event has already been processed (for idempotency).
     */
    @Transactional(readOnly = true)
    public boolean isEventProcessed(String eventId) {
        return eventRepository.existsByEventId(eventId);
    }
    
    /**
     * Publish an event to the application event publisher for projections to consume.
     */
    public void publishEvent(DomainEvent event) {
        logger.debug("Publishing event {} of type {}", event.getEventId(), event.getEventType());
        eventPublisher.publishEvent(new DomainEventWrapper(this, event));
    }
    
    /**
     * Convert a domain event to a persistent entity.
     */
    private EventEntity toEntity(DomainEvent event) {
        try {
            String payload = objectMapper.writeValueAsString(event);
            return new EventEntity(
                    event.getEventId(),
                    event.getAggregateId(),
                    event.getVersion(),
                    event.getTimestamp(),
                    event.getEventType(),
                    payload
            );
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize event", e);
        }
    }
    
    /**
     * Convert a persistent entity to a domain event.
     * Uses the persisted event_type for polymorphic deserialization.
     */
    private DomainEvent fromEntity(EventEntity entity) {
        try {
            // Use the persisted event_type for polymorphic deserialization
            Class<? extends DomainEvent> eventClass = (Class<? extends DomainEvent>) Class.forName(entity.getEventType());
            DomainEvent event = objectMapper.readValue(entity.getPayload(), eventClass);
            return event;
        } catch (ClassNotFoundException e) {
            throw new RuntimeException("Failed to find event class: " + entity.getEventType(), e);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize event", e);
        }
    }
    
    /**
     * Ensure that the event version matches the expected sequence number.
     * This enforces correct versioning while keeping events immutable.
     */
    private DomainEvent ensureEventVersion(DomainEvent event, Long expectedVersion) {
        if (!expectedVersion.equals(event.getVersion())) {
            throw new IllegalStateException(String.format(
                    "Event version mismatch for aggregate %s: expected %d but was %d",
                    event.getAggregateId(), expectedVersion, event.getVersion()));
        }
        return event;
    }
}
