package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.domain.order.*;
import com.example.eventsourcing.infrastructure.DomainEventWrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.example.eventsourcing.infrastructure.DomainEventWrapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.annotation.Commit;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for OrderProjection.
 * Uses PostgreSQL service from docker-compose.
 */
@SpringBootTest
@DisplayName("OrderProjection Integration Tests")
class OrderProjectionIntegrationTest {
    
    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        // Use PostgreSQL service from docker-compose
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
    private ApplicationEventPublisher eventPublisher;
    
    @Autowired
    private OrderProjectionRepository repository;
    
    @BeforeEach
    void cleanup() {
        repository.deleteAll();
    }
    
    @Test
    @Transactional
    @Commit
    @DisplayName("should create projection on OrderCreatedEvent")
    void shouldCreateProjectionOnOrderCreatedEvent() throws InterruptedException {
        UUID aggregateId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        
        OrderCreatedEvent event = new OrderCreatedEvent(
            UUID.randomUUID(), aggregateId, 1L, Instant.now(), customerId
        );
        
        // Publish event - handlers run after commit
        eventPublisher.publishEvent(new DomainEventWrapper<>(event));
        // Transaction commits here, triggering AFTER_COMMIT handlers
        Thread.sleep(500); // Wait for async handler
        
        Optional<OrderProjectionEntity> result = repository.findById(aggregateId);
        
        assertTrue(result.isPresent());
        assertEquals(customerId, result.get().getCustomerId());
        assertEquals(OrderStatus.DRAFT, result.get().getStatus());
        assertEquals(0, result.get().getItemCount());
        assertTrue(BigDecimal.ZERO.compareTo(result.get().getTotalAmount()) == 0);
    }
    
    @Test
    @Transactional
    @Commit
    @DisplayName("should update projection on ItemAddedEvent")
    void shouldUpdateProjectionOnItemAddedEvent() throws InterruptedException {
        UUID aggregateId = UUID.randomUUID();
        
        // Create order projection
        createOrderProjection(aggregateId);
        Thread.sleep(500);
        
        // Add item
        OrderItemAddedEvent event = new OrderItemAddedEvent(
            UUID.randomUUID(), aggregateId, 2L, Instant.now(),
            UUID.randomUUID(), 5, BigDecimal.TEN
        );
        
        eventPublisher.publishEvent(new DomainEventWrapper<>(event));
        Thread.sleep(500);
        
        OrderProjectionEntity result = repository.findById(aggregateId).orElseThrow();
        
        assertEquals(1, result.getItemCount());
        assertTrue(BigDecimal.valueOf(50.00).compareTo(result.getTotalAmount()) == 0);
    }
    
    @Test
    @Transactional
    @Commit
    @DisplayName("should update projection on OrderSubmittedEvent")
    void shouldUpdateProjectionOnOrderSubmittedEvent() throws InterruptedException {
        UUID aggregateId = UUID.randomUUID();
        
        // Create order projection with item
        createOrderProjection(aggregateId);
        Thread.sleep(500);
        addItemToProjection(aggregateId);
        Thread.sleep(500);
        
        // Submit order
        OrderSubmittedEvent event = new OrderSubmittedEvent(
            UUID.randomUUID(), aggregateId, 3L, Instant.now()
        );
        
        eventPublisher.publishEvent(new DomainEventWrapper<>(event));
        Thread.sleep(500);
        
        OrderProjectionEntity result = repository.findById(aggregateId).orElseThrow();
        
        assertEquals(OrderStatus.SUBMITTED, result.getStatus());
        assertNotNull(result.getSubmittedAt());
    }
    
    @Test
    @Transactional
    @Commit
    @DisplayName("should be idempotent - processing same event twice has no effect")
    void shouldBeIdempotent() throws InterruptedException {
        UUID aggregateId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        
        OrderCreatedEvent event = new OrderCreatedEvent(
            UUID.randomUUID(), aggregateId, 1L, Instant.now(), customerId
        );
        
        // Process once
        eventPublisher.publishEvent(new DomainEventWrapper<>(event));
        Thread.sleep(500);
        OrderProjectionEntity first = repository.findById(aggregateId).orElseThrow();
        
        // Process again
        eventPublisher.publishEvent(new DomainEventWrapper<>(event));
        Thread.sleep(500);
        OrderProjectionEntity second = repository.findById(aggregateId).orElseThrow();
        
        // Should be identical
        assertEquals(first.getCreatedAt(), second.getCreatedAt());
        assertEquals(first.getStatus(), second.getStatus());
        assertEquals(first.getItemCount(), second.getItemCount());
    }
    
    @Test
    @Transactional
    @Commit
    @DisplayName("should handle ItemRemovedEvent")
    void shouldHandleItemRemovedEvent() throws InterruptedException {
        UUID aggregateId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        
        createOrderProjection(aggregateId);
        Thread.sleep(500);
        addItemToProjection(aggregateId);
        Thread.sleep(500);
        
        OrderItemRemovedEvent event = new OrderItemRemovedEvent(
            UUID.randomUUID(), aggregateId, 3L, Instant.now(), productId
        );
        
        eventPublisher.publishEvent(new DomainEventWrapper<>(event));
        Thread.sleep(500);
        
        OrderProjectionEntity result = repository.findById(aggregateId).orElseThrow();
        assertEquals(0, result.getItemCount());
    }
    
    @Test
    @Transactional
    @Commit
    @DisplayName("should not create duplicate projections")
    void shouldNotCreateDuplicateProjections() throws InterruptedException {
        UUID aggregateId = UUID.randomUUID();
        
        OrderCreatedEvent event = new OrderCreatedEvent(
            UUID.randomUUID(), aggregateId, 1L, Instant.now(), UUID.randomUUID()
        );
        
        eventPublisher.publishEvent(new DomainEventWrapper<>(event));
        Thread.sleep(500);
        eventPublisher.publishEvent(new DomainEventWrapper<>(event));
        Thread.sleep(500);
        
        assertEquals(1, repository.count());
    }
    
    @Test
    @Transactional
    @Commit
    @DisplayName("should update total amount correctly with multiple items")
    void shouldUpdateTotalAmountCorrectlyWithMultipleItems() throws InterruptedException {
        UUID aggregateId = UUID.randomUUID();
        
        createOrderProjection(aggregateId);
        Thread.sleep(500);
        
        eventPublisher.publishEvent(new DomainEventWrapper<>(new OrderItemAddedEvent(
            UUID.randomUUID(), aggregateId, 2L, Instant.now(),
            UUID.randomUUID(), 5, BigDecimal.valueOf(100)
        )));
        Thread.sleep(500);
        
        eventPublisher.publishEvent(new DomainEventWrapper<>(new OrderItemAddedEvent(
            UUID.randomUUID(), aggregateId, 3L, Instant.now(),
            UUID.randomUUID(), 3, BigDecimal.valueOf(50)
        )));
        Thread.sleep(500);
        
        OrderProjectionEntity result = repository.findById(aggregateId).orElseThrow();
        assertTrue(BigDecimal.valueOf(650).compareTo(result.getTotalAmount()) == 0);
        assertEquals(2, result.getItemCount());
    }
    
    @Test
    @Transactional
    @Commit
    @DisplayName("should prevent double submission")
    void shouldPreventDoubleSubmission() throws InterruptedException {
        UUID aggregateId = UUID.randomUUID();
        
        createOrderProjection(aggregateId);
        Thread.sleep(500);
        addItemToProjection(aggregateId);
        Thread.sleep(500);
        
        OrderSubmittedEvent event = new OrderSubmittedEvent(
            UUID.randomUUID(), aggregateId, 3L, Instant.now()
        );
        
        eventPublisher.publishEvent(new DomainEventWrapper<>(event));
        Thread.sleep(500);
        Instant firstSubmitTime = repository.findById(aggregateId).orElseThrow().getSubmittedAt();
        
        eventPublisher.publishEvent(new DomainEventWrapper<>(event));
        Thread.sleep(500);
        Instant secondSubmitTime = repository.findById(aggregateId).orElseThrow().getSubmittedAt();
        
        assertEquals(firstSubmitTime, secondSubmitTime);
    }
    
    private void createOrderProjection(UUID aggregateId) {
        OrderCreatedEvent event = new OrderCreatedEvent(
            UUID.randomUUID(), aggregateId, 1L, Instant.now(), UUID.randomUUID()
        );
        eventPublisher.publishEvent(new DomainEventWrapper<>(event));
    }
    
    private void addItemToProjection(UUID aggregateId) {
        OrderItemAddedEvent event = new OrderItemAddedEvent(
            UUID.randomUUID(), aggregateId, 2L, Instant.now(),
            UUID.randomUUID(), 5, BigDecimal.TEN
        );
        eventPublisher.publishEvent(new DomainEventWrapper<>(event));
    }
}

