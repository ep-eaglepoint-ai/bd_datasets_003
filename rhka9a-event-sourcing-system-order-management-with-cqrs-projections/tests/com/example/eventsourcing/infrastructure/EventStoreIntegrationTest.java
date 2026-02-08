package com.example.eventsourcing.infrastructure;

import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.domain.order.*;
import com.example.eventsourcing.exception.ConcurrencyException;
import com.example.eventsourcing.infrastructure.persistence.EventEntity;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for EventStore.
 * Uses PostgreSQL service from docker-compose.
 */
@SpringBootTest
@DisplayName("EventStore Integration Tests")
class EventStoreIntegrationTest {
    
    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        // Use PostgreSQL service from docker-compose
        // Accessible at postgres:5432 from within Docker network
        String dbUrl = System.getenv().getOrDefault(
            "SPRING_DATASOURCE_URL", 
            "jdbc:postgresql://postgres:5432/event_sourcing_db"
        );
        String dbUser = System.getenv().getOrDefault(
            "SPRING_DATASOURCE_USERNAME", 
            "postgres"
        );
        String dbPassword = System.getenv().getOrDefault(
            "SPRING_DATASOURCE_PASSWORD", 
            "postgres"
        );
        
        registry.add("spring.datasource.url", () -> dbUrl);
        registry.add("spring.datasource.username", () -> dbUser);
        registry.add("spring.datasource.password", () -> dbPassword);
    }
    
    @Autowired
    private EventStore eventStore;
    
    @Autowired
    private EventRepository eventRepository;
    
    @Test
    @Transactional
    @DisplayName("should persist events with sequential versions")
    void shouldPersistEventsWithSequentialVersions() {
        UUID aggregateId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        
        List<DomainEvent> events = List.of(
            new OrderCreatedEvent(UUID.randomUUID(), aggregateId, 1L, Instant.now(), customerId),
            new OrderItemAddedEvent(UUID.randomUUID(), aggregateId, 2L, Instant.now(), 
                UUID.randomUUID(), 5, BigDecimal.TEN)
        );
        
        eventStore.appendEvents(aggregateId, "OrderAggregate", 0L, events);
        
        List<EventEntity> stored = eventRepository.findByAggregateIdOrderByEventVersionAsc(aggregateId);
        
        assertEquals(2, stored.size());
        assertEquals(1L, stored.get(0).getEventVersion());
        assertEquals(2L, stored.get(1).getEventVersion());
    }
    
    @Test
    @Transactional
    @DisplayName("should detect concurrent modifications")
    void shouldDetectConcurrentModifications() {
        UUID aggregateId = UUID.randomUUID();
        
        // First transaction: create order
        eventStore.appendEvents(aggregateId, "OrderAggregate", 0L, List.of(
            new OrderCreatedEvent(UUID.randomUUID(), aggregateId, 1L, Instant.now(), UUID.randomUUID())
        ));
        
        // Two concurrent transactions trying to add items
        List<DomainEvent> events1 = List.of(
            new OrderItemAddedEvent(UUID.randomUUID(), aggregateId, 2L, Instant.now(), 
                UUID.randomUUID(), 5, BigDecimal.TEN)
        );
        
        List<DomainEvent> events2 = List.of(
            new OrderItemAddedEvent(UUID.randomUUID(), aggregateId, 2L, Instant.now(), 
                UUID.randomUUID(), 3, BigDecimal.valueOf(20))
        );
        
        // First should succeed
        eventStore.appendEvents(aggregateId, "OrderAggregate", 1L, events1);
        
        // Second should fail with concurrency exception
        assertThrows(ConcurrencyException.class, 
            () -> eventStore.appendEvents(aggregateId, "OrderAggregate", 1L, events2));
    }
    
    @Test
    @Transactional
    @DisplayName("should retrieve events in correct order")
    void shouldRetrieveEventsInCorrectOrder() {
        UUID aggregateId = UUID.randomUUID();
        
        // Create and persist events
        List<DomainEvent> original = createEventSequence(aggregateId);
        eventStore.appendEvents(aggregateId, "OrderAggregate", 0L, original);
        
        // Retrieve events
        List<DomainEvent> retrieved = eventStore.getEvents(aggregateId);
        
        assertEquals(original.size(), retrieved.size());
        for (int i = 0; i < original.size(); i++) {
            assertEquals(original.get(i).getClass(), retrieved.get(i).getClass());
            assertEquals(original.get(i).getVersion(), retrieved.get(i).getVersion());
        }
    }
    
    @Test
    @Transactional
    @DisplayName("should serialize and deserialize events correctly")
    void shouldSerializeAndDeserializeEventsCorrectly() {
        UUID aggregateId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        BigDecimal unitPrice = BigDecimal.valueOf(123.45);
        
        OrderItemAddedEvent original = new OrderItemAddedEvent(
            UUID.randomUUID(), aggregateId, 1L, Instant.now(), productId, 5, unitPrice
        );
        
        eventStore.appendEvents(aggregateId, "OrderAggregate", 0L, List.of(original));
        
        List<DomainEvent> retrieved = eventStore.getEvents(aggregateId);
        
        assertEquals(1, retrieved.size());
        assertInstanceOf(OrderItemAddedEvent.class, retrieved.get(0));
        
        OrderItemAddedEvent deserialized = (OrderItemAddedEvent) retrieved.get(0);
        assertEquals(productId, deserialized.productId());
        assertEquals(5, deserialized.quantity());
        assertEquals(unitPrice, deserialized.unitPrice());
    }
    
    @Test
    @Transactional
    @DisplayName("should get latest version for aggregate")
    void shouldGetLatestVersionForAggregate() {
        UUID aggregateId = UUID.randomUUID();
        
        assertEquals(0L, eventStore.getLatestVersion(aggregateId));
        
        eventStore.appendEvents(aggregateId, "OrderAggregate", 0L, List.of(
            new OrderCreatedEvent(UUID.randomUUID(), aggregateId, 1L, Instant.now(), UUID.randomUUID())
        ));
        
        assertEquals(1L, eventStore.getLatestVersion(aggregateId));
        
        eventStore.appendEvents(aggregateId, "OrderAggregate", 1L, List.of(
            new OrderItemAddedEvent(UUID.randomUUID(), aggregateId, 2L, Instant.now(), 
                UUID.randomUUID(), 5, BigDecimal.TEN)
        ));
        
        assertEquals(2L, eventStore.getLatestVersion(aggregateId));
    }
    
    @Test
    @Transactional
    @DisplayName("should retrieve events after specific version")
    void shouldRetrieveEventsAfterSpecificVersion() {
        UUID aggregateId = UUID.randomUUID();
        List<DomainEvent> events = createEventSequence(aggregateId);
        
        eventStore.appendEvents(aggregateId, "OrderAggregate", 0L, events);
        
        List<DomainEvent> afterVersion1 = eventStore.getEventsAfterVersion(aggregateId, 1L);
        
        assertEquals(3, afterVersion1.size());
        assertTrue(afterVersion1.stream().allMatch(e -> e.getVersion() > 1L));
    }
    
    @Test
    @Transactional
    @DisplayName("should handle empty event list")
    void shouldHandleEmptyEventList() {
        UUID aggregateId = UUID.randomUUID();
        
        eventStore.appendEvents(aggregateId, "OrderAggregate", 0L, List.of());
        
        List<DomainEvent> retrieved = eventStore.getEvents(aggregateId);
        assertTrue(retrieved.isEmpty());
    }
    
    @Test
    @Transactional
    @DisplayName("should store event metadata")
    void shouldStoreEventMetadata() {
        UUID aggregateId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        
        OrderCreatedEvent event = new OrderCreatedEvent(
            eventId, aggregateId, 1L, Instant.now(), UUID.randomUUID()
        );
        
        eventStore.appendEvents(aggregateId, "OrderAggregate", 0L, List.of(event));
        
        List<EventEntity> stored = eventRepository.findByAggregateIdOrderByEventVersionAsc(aggregateId);
        
        assertEquals(1, stored.size());
        EventEntity entity = stored.get(0);
        assertEquals(aggregateId, entity.getAggregateId());
        assertEquals("OrderAggregate", entity.getAggregateType());
        assertEquals(OrderCreatedEvent.class.getName(), entity.getEventType());
        assertNotNull(entity.getCreatedAt());
    }
    
    @Test
    @Transactional
    @DisplayName("should reject invalid expected version")
    void shouldRejectInvalidExpectedVersion() {
        UUID aggregateId = UUID.randomUUID();
        
        eventStore.appendEvents(aggregateId, "OrderAggregate", 0L, List.of(
            new OrderCreatedEvent(UUID.randomUUID(), aggregateId, 1L, Instant.now(), UUID.randomUUID())
        ));
        
        // Try to append with wrong expected version
        assertThrows(ConcurrencyException.class, 
            () -> eventStore.appendEvents(aggregateId, "OrderAggregate", 0L, List.of(
                new OrderItemAddedEvent(UUID.randomUUID(), aggregateId, 2L, Instant.now(), 
                    UUID.randomUUID(), 5, BigDecimal.TEN)
            ))
        );
    }
    
    @Test
    @Transactional
    @DisplayName("should handle multiple aggregates independently")
    void shouldHandleMultipleAggregatesIndependently() {
        UUID aggregate1 = UUID.randomUUID();
        UUID aggregate2 = UUID.randomUUID();
        
        eventStore.appendEvents(aggregate1, "OrderAggregate", 0L, List.of(
            new OrderCreatedEvent(UUID.randomUUID(), aggregate1, 1L, Instant.now(), UUID.randomUUID())
        ));
        
        eventStore.appendEvents(aggregate2, "OrderAggregate", 0L, List.of(
            new OrderCreatedEvent(UUID.randomUUID(), aggregate2, 1L, Instant.now(), UUID.randomUUID())
        ));
        
        assertEquals(1L, eventStore.getLatestVersion(aggregate1));
        assertEquals(1L, eventStore.getLatestVersion(aggregate2));
        
        List<DomainEvent> events1 = eventStore.getEvents(aggregate1);
        List<DomainEvent> events2 = eventStore.getEvents(aggregate2);
        
        assertEquals(1, events1.size());
        assertEquals(1, events2.size());
        assertEquals(aggregate1, events1.get(0).getAggregateId());
        assertEquals(aggregate2, events2.get(0).getAggregateId());
    }
    
    private List<DomainEvent> createEventSequence(UUID aggregateId) {
        return List.of(
            new OrderCreatedEvent(UUID.randomUUID(), aggregateId, 1L, Instant.now(), UUID.randomUUID()),
            new OrderItemAddedEvent(UUID.randomUUID(), aggregateId, 2L, Instant.now(), 
                UUID.randomUUID(), 5, BigDecimal.TEN),
            new OrderItemAddedEvent(UUID.randomUUID(), aggregateId, 3L, Instant.now(), 
                UUID.randomUUID(), 3, BigDecimal.valueOf(20)),
            new OrderSubmittedEvent(UUID.randomUUID(), aggregateId, 4L, Instant.now())
        );
    }
}

