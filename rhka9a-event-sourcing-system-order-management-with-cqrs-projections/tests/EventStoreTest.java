package com.example.eventsourcing.infrastructure;

import com.example.eventsourcing.config.EventSourcingProperties;
import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.domain.order.OrderCreatedEvent;
import com.example.eventsourcing.domain.order.OrderItemAddedEvent;
import com.example.eventsourcing.exception.ConcurrencyException;
import com.example.eventsourcing.infrastructure.persistence.EventEntity;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import com.example.eventsourcing.infrastructure.persistence.SnapshotRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for EventStore.
 * Tests optimistic locking and event persistence.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("EventStore Tests")
class EventStoreTest {
    
    @Mock
    private EventRepository eventRepository;
    
    @Mock
    private SnapshotRepository snapshotRepository;
    
    @Mock
    private ApplicationEventPublisher eventPublisher;
    
    private ObjectMapper objectMapper;
    private EventSourcingProperties properties;
    private EventStore eventStore;
    
    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        properties = new EventSourcingProperties();
        eventStore = new EventStore(eventRepository, objectMapper, eventPublisher, properties);
    }
    
    @Nested
    @DisplayName("AppendEvents with Optimistic Locking")
    class AppendEventsTests {
        
        @Test
        @DisplayName("Should throw ConcurrencyException when version doesn't match")
        void shouldThrowConcurrencyExceptionWhenVersionMismatch() {
            String aggregateId = "order-123";
            Long expectedVersion = 0L;
            List<DomainEvent> events = Arrays.asList(
                    new OrderCreatedEvent(aggregateId, 1L, "customer-123", BigDecimal.ZERO)
            );
            
            when(eventRepository.getCurrentVersion(aggregateId)).thenReturn(5L);
            
            ConcurrencyException exception = assertThrows(ConcurrencyException.class, () ->
                    eventStore.appendEvents(aggregateId, expectedVersion, events)
            );
            
            assertEquals(aggregateId, exception.getAggregateId());
            assertEquals(expectedVersion, exception.getExpectedVersion());
            assertEquals(5L, exception.getActualVersion());
            verify(eventRepository, never()).save(any(EventEntity.class));
        }
        
        @Test
        @DisplayName("Should append initial event for new aggregate with optimistic locking")
        void shouldAppendInitialEventWithOptimisticLocking() {
            String aggregateId = "order-123";
            DomainEvent event = new OrderCreatedEvent(aggregateId, 1L, "customer-123", BigDecimal.ZERO);
            
            // Simulate no existing events (version = 0)
            when(eventRepository.getCurrentVersion(aggregateId)).thenReturn(0L);
            when(eventRepository.save(any(EventEntity.class))).thenAnswer(i -> i.getArgument(0));
            
            DomainEvent savedEvent = eventStore.appendInitialEvent(aggregateId, event);
            
            assertNotNull(savedEvent);
            verify(eventRepository, times(1)).save(any(EventEntity.class));
            // Verify optimistic locking check was performed
            verify(eventRepository, times(1)).getCurrentVersion(aggregateId);
        }
        
        @Test
        @DisplayName("Should throw ConcurrencyException when appending initial event to existing aggregate")
        void shouldThrowConcurrencyExceptionWhenAppendingInitialToExistingAggregate() {
            String aggregateId = "order-123";
            DomainEvent event = new OrderCreatedEvent(aggregateId, 1L, "customer-123", BigDecimal.ZERO);
            
            // Simulate existing events (version > 0)
            when(eventRepository.getCurrentVersion(aggregateId)).thenReturn(3L);
            
            assertThrows(ConcurrencyException.class, () -> 
                    eventStore.appendInitialEvent(aggregateId, event)
            );
            
            // Verify save was never called due to optimistic locking failure
            verify(eventRepository, never()).save(any(EventEntity.class));
        }
    }
    
    @Nested
    @DisplayName("LoadEvents")
    class LoadEventsTests {
        
        @Test
        @DisplayName("Should return empty list when no events exist")
        void shouldReturnEmptyListWhenNoEvents() {
            String aggregateId = "order-123";
            
            when(eventRepository.findByAggregateIdOrderByVersionAsc(aggregateId)).thenReturn(List.of());
            
            List<DomainEvent> events = eventStore.loadEvents(aggregateId);
            
            assertTrue(events.isEmpty());
        }
    }
    
    @Nested
    @DisplayName("Event Processing Check")
    class EventProcessingTests {
        
        @Test
        @DisplayName("Should check if event has been processed")
        void shouldCheckIfEventProcessed() {
            String eventId = "event-123";
            
            when(eventRepository.existsByEventId(eventId)).thenReturn(true);
            
            assertTrue(eventStore.isEventProcessed(eventId));
            
            when(eventRepository.existsByEventId("new-event")).thenReturn(false);
            assertFalse(eventStore.isEventProcessed("new-event"));
        }
        
        @Test
        @DisplayName("Should get current version of aggregate")
        void shouldGetCurrentVersion() {
            String aggregateId = "order-123";
            
            when(eventRepository.getCurrentVersion(aggregateId)).thenReturn(5L);
            
            assertEquals(5L, eventStore.getCurrentVersion(aggregateId));
        }
    }
    
    private EventEntity createEventEntity(String eventId, String aggregateId, Long version, String eventType) {
        EventEntity entity = new EventEntity();
        entity.setEventId(eventId);
        entity.setAggregateId(aggregateId);
        entity.setVersion(version);
        entity.setEventType("com.example.eventsourcing.domain.order." + eventType);
        entity.setTimestamp(Instant.now());
        entity.setPayload("{}");
        return entity;
    }
}
