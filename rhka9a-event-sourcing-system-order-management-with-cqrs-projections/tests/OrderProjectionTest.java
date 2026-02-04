package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.domain.order.*;
import com.example.eventsourcing.infrastructure.DomainEventWrapper;
import com.example.eventsourcing.infrastructure.persistence.EventEntity;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for OrderProjection.
 * Tests idempotency and event handling.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("OrderProjection Tests")
class OrderProjectionTest {
    
    @Mock
    private OrderProjectionRepository projectionRepository;
    
    @Mock
    private EventRepository eventRepository;
    
    private OrderProjection orderProjection;
    
    @BeforeEach
    void setUp() {
        orderProjection = new OrderProjection(projectionRepository, eventRepository);
    }
    
    @Nested
    @DisplayName("OrderCreatedEvent Handling")
    class OrderCreatedEventTests {
        
        @Test
        @DisplayName("Should create projection on OrderCreatedEvent")
        void shouldCreateProjectionOnOrderCreated() {
            String orderId = "order-123";
            String customerId = "customer-123";
            OrderCreatedEvent event = new OrderCreatedEvent(orderId, 1L, customerId, BigDecimal.ZERO);
            DomainEventWrapper wrapper = new DomainEventWrapper(this, event);
            
            when(projectionRepository.existsByOrderId(orderId)).thenReturn(false);
            when(projectionRepository.save(any())).thenAnswer(i -> i.getArgument(0));
            
            orderProjection.handleDomainEvent(wrapper);
            
            ArgumentCaptor<OrderProjectionEntity> captor = ArgumentCaptor.forClass(OrderProjectionEntity.class);
            verify(projectionRepository, times(1)).save(captor.capture());
            
            OrderProjectionEntity projection = captor.getValue();
            assertEquals(orderId, projection.getOrderId());
            assertEquals(customerId, projection.getCustomerId());
            assertEquals(OrderStatus.DRAFT, projection.getStatus());
            assertEquals(BigDecimal.ZERO, projection.getTotalAmount());
            assertEquals(0, projection.getItemCount());
        }
        
        @Test
        @DisplayName("Should be idempotent - processing same event twice has no effect")
        void shouldBeIdempotent() {
            String orderId = "order-123";
            OrderCreatedEvent event = new OrderCreatedEvent(orderId, 1L, "customer-123", BigDecimal.ZERO);
            DomainEventWrapper wrapper = new DomainEventWrapper(this, event);
            
            when(projectionRepository.existsByOrderId(orderId)).thenReturn(false);
            when(projectionRepository.save(any())).thenAnswer(i -> i.getArgument(0));
            
            // Process event twice
            orderProjection.handleDomainEvent(wrapper);
            orderProjection.handleDomainEvent(wrapper);
            
            // Should only save once
            verify(projectionRepository, times(1)).save(any());
        }
        
        @Test
        @DisplayName("Should skip if projection already exists")
        void shouldSkipIfProjectionExists() {
            String orderId = "order-123";
            OrderCreatedEvent event = new OrderCreatedEvent(orderId, 1L, "customer-123", BigDecimal.ZERO);
            DomainEventWrapper wrapper = new DomainEventWrapper(this, event);
            
            when(projectionRepository.existsByOrderId(orderId)).thenReturn(true);
            
            orderProjection.handleDomainEvent(wrapper);
            
            verify(projectionRepository, never()).save(any());
        }
    }
    
    @Nested
    @DisplayName("OrderItemAddedEvent Handling")
    class OrderItemAddedEventTests {
        
        @Test
        @DisplayName("Should update projection on OrderItemAddedEvent")
        void shouldUpdateProjectionOnItemAdded() {
            String orderId = "order-123";
            OrderItemAddedEvent event = new OrderItemAddedEvent(
                    orderId, 2L, "product-1", "Laptop", 1, 
                    new BigDecimal("999.99"), new BigDecimal("999.99"));
            DomainEventWrapper wrapper = new DomainEventWrapper(this, event);
            
            OrderProjectionEntity existingProjection = new OrderProjectionEntity(
                    orderId, "customer-123", OrderStatus.DRAFT, BigDecimal.ZERO, 0, Instant.now());
            
            when(projectionRepository.findByOrderId(orderId)).thenReturn(Optional.of(existingProjection));
            when(projectionRepository.save(any())).thenAnswer(i -> i.getArgument(0));
            
            orderProjection.handleDomainEvent(wrapper);
            
            ArgumentCaptor<OrderProjectionEntity> captor = ArgumentCaptor.forClass(OrderProjectionEntity.class);
            verify(projectionRepository, times(1)).save(captor.capture());
            
            OrderProjectionEntity updated = captor.getValue();
            assertEquals(new BigDecimal("999.99"), updated.getTotalAmount());
            assertEquals(1, updated.getItemCount());
        }
    }
    
    @Nested
    @DisplayName("OrderItemRemovedEvent Handling")
    class OrderItemRemovedEventTests {
        
        @Test
        @DisplayName("Should update projection on OrderItemRemovedEvent using newTotalAmount")
        void shouldUpdateProjectionOnItemRemoved() {
            String orderId = "order-123";
            BigDecimal previousTotal = new BigDecimal("999.99");
            BigDecimal newTotal = BigDecimal.ZERO;
            OrderItemRemovedEvent event = new OrderItemRemovedEvent(
                    orderId, 3L, "product-1", 1, previousTotal, newTotal);
            DomainEventWrapper wrapper = new DomainEventWrapper(this, event);
            
            OrderProjectionEntity existingProjection = new OrderProjectionEntity(
                    orderId, "customer-123", OrderStatus.DRAFT, previousTotal, 1, Instant.now());
            
            when(projectionRepository.findByOrderId(orderId)).thenReturn(Optional.of(existingProjection));
            when(projectionRepository.save(any())).thenAnswer(i -> i.getArgument(0));
            
            orderProjection.handleDomainEvent(wrapper);
            
            ArgumentCaptor<OrderProjectionEntity> captor = ArgumentCaptor.forClass(OrderProjectionEntity.class);
            verify(projectionRepository, times(1)).save(captor.capture());
            
            OrderProjectionEntity updated = captor.getValue();
            assertEquals(BigDecimal.ZERO, updated.getTotalAmount());
            assertEquals(0, updated.getItemCount());
        }
    }
    
    @Nested
    @DisplayName("OrderSubmittedEvent Handling")
    class OrderSubmittedEventTests {
        
        @Test
        @DisplayName("Should update status to SUBMITTED on OrderSubmittedEvent")
        void shouldUpdateStatusToSubmitted() {
            String orderId = "order-123";
            OrderSubmittedEvent event = new OrderSubmittedEvent(
                    orderId, 4L, "customer-123", new BigDecimal("999.99"), 1);
            DomainEventWrapper wrapper = new DomainEventWrapper(this, event);
            
            OrderProjectionEntity existingProjection = new OrderProjectionEntity(
                    orderId, "customer-123", OrderStatus.DRAFT, new BigDecimal("999.99"), 1, Instant.now());
            
            when(projectionRepository.findByOrderId(orderId)).thenReturn(Optional.of(existingProjection));
            when(projectionRepository.save(any())).thenAnswer(i -> i.getArgument(0));
            
            orderProjection.handleDomainEvent(wrapper);
            
            ArgumentCaptor<OrderProjectionEntity> captor = ArgumentCaptor.forClass(OrderProjectionEntity.class);
            verify(projectionRepository, times(1)).save(captor.capture());
            
            OrderProjectionEntity updated = captor.getValue();
            assertEquals(OrderStatus.SUBMITTED, updated.getStatus());
            assertNotNull(updated.getSubmittedAt());
        }
    }
    
    @Nested
    @DisplayName("Query Methods")
    class QueryMethodsTests {
        
        @Test
        @DisplayName("Should get order by ID")
        void shouldGetOrderById() {
            String orderId = "order-123";
            OrderProjectionEntity projection = new OrderProjectionEntity(
                    orderId, "customer-123", OrderStatus.DRAFT, BigDecimal.ZERO, 0, Instant.now());
            
            when(projectionRepository.findByOrderId(orderId)).thenReturn(Optional.of(projection));
            
            OrderProjectionEntity result = orderProjection.getOrder(orderId);
            
            assertNotNull(result);
            assertEquals(orderId, result.getOrderId());
        }
        
        @Test
        @DisplayName("Should get orders by customer")
        void shouldGetOrdersByCustomer() {
            String customerId = "customer-123";
            List<OrderProjectionEntity> orders = Arrays.asList(
                    new OrderProjectionEntity("order-1", customerId, OrderStatus.DRAFT, 
                            BigDecimal.ZERO, 0, Instant.now()),
                    new OrderProjectionEntity("order-2", customerId, OrderStatus.SUBMITTED, 
                            new BigDecimal("100.00"), 1, Instant.now())
            );
            
            when(projectionRepository.findByCustomerId(customerId)).thenReturn(orders);
            
            List<OrderProjectionEntity> result = orderProjection.getOrdersByCustomer(customerId);
            
            assertEquals(2, result.size());
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
