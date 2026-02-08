package com.example.eventsourcing.e2e;

import com.example.eventsourcing.domain.order.*;
import com.example.eventsourcing.infrastructure.AggregateRepository;
import com.example.eventsourcing.infrastructure.EventStore;
import com.example.eventsourcing.infrastructure.projection.OrderProjectionRepository;
import com.example.eventsourcing.service.OrderQueryService;
import com.example.eventsourcing.service.OrderService;
import com.example.eventsourcing.service.dto.OrderProjectionDTO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * End-to-end tests for the complete order lifecycle.
 * Uses PostgreSQL service from docker-compose.
 */
@SpringBootTest
@DisplayName("End-to-End Tests")
class OrderLifecycleE2ETest {
    
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
    private OrderService orderService;
    
    @Autowired
    private OrderQueryService queryService;
    
    @Autowired
    private AggregateRepository<OrderAggregate> aggregateRepository;
    
    @Autowired
    private EventStore eventStore;
    
    @Autowired
    private OrderProjectionRepository projectionRepository;
    
    @Test
    @DisplayName("should complete full order lifecycle from creation to submission")
    void shouldCompleteFullOrderLifecycle() throws InterruptedException {
        UUID customerId = UUID.randomUUID();
        
        // 1. Create order
        UUID orderId = orderService.createOrder(new CreateOrderCommand(customerId));
        assertNotNull(orderId);
        
        // 2. Add items
        UUID product1 = UUID.randomUUID();
        UUID product2 = UUID.randomUUID();
        
        orderService.addItem(new AddItemCommand(orderId, product1, 5, BigDecimal.valueOf(100)));
        orderService.addItem(new AddItemCommand(orderId, product2, 3, BigDecimal.valueOf(50)));
        
        // 3. Submit order
        orderService.submitOrder(new SubmitOrderCommand(orderId));
        
        // Wait for projections (handlers run synchronously after commit, but give it time)
        Thread.sleep(1000);
        
        // 4. Query and verify
        Optional<OrderProjectionDTO> result = queryService.getOrder(orderId);
        
        assertTrue(result.isPresent(), "Projection should exist after order submission");
        OrderProjectionDTO order = result.get();
        assertEquals(customerId, order.customerId());
        assertEquals(OrderStatus.SUBMITTED, order.status());
        assertEquals(2, order.itemCount());
        assertTrue(BigDecimal.valueOf(650).compareTo(order.totalAmount()) == 0);
        assertNotNull(order.submittedAt());
    }
    
    @Test
    @DisplayName("should handle item removal in order lifecycle")
    void shouldHandleItemRemovalInOrderLifecycle() throws InterruptedException {
        UUID customerId = UUID.randomUUID();
        UUID orderId = orderService.createOrder(new CreateOrderCommand(customerId));
        
        UUID product1 = UUID.randomUUID();
        UUID product2 = UUID.randomUUID();
        
        orderService.addItem(new AddItemCommand(orderId, product1, 5, BigDecimal.TEN));
        orderService.addItem(new AddItemCommand(orderId, product2, 3, BigDecimal.valueOf(20)));
        orderService.removeItem(new RemoveItemCommand(orderId, product1));
        orderService.submitOrder(new SubmitOrderCommand(orderId));
        
        Thread.sleep(1000);
        
        Optional<OrderProjectionDTO> result = queryService.getOrder(orderId);
        assertTrue(result.isPresent(), "Projection should exist");
        assertEquals(1, result.get().itemCount());
    }
    
    @Test
    @DisplayName("should maintain consistency between write and read models")
    void shouldMaintainConsistencyBetweenWriteAndReadModels() throws InterruptedException {
        UUID customerId = UUID.randomUUID();
        UUID orderId = orderService.createOrder(new CreateOrderCommand(customerId));
        
        orderService.addItem(new AddItemCommand(orderId, UUID.randomUUID(), 5, BigDecimal.valueOf(100)));
        orderService.addItem(new AddItemCommand(orderId, UUID.randomUUID(), 3, BigDecimal.valueOf(50)));
        
        Thread.sleep(1500); // Wait for projection handlers to complete
        
        // Load from write model
        OrderAggregate writeModel = aggregateRepository.load(orderId, OrderAggregate.class).orElseThrow();
        
        // Load from read model
        Optional<OrderProjectionDTO> readModelOpt = queryService.getOrder(orderId);
        assertTrue(readModelOpt.isPresent(), "Projection should exist");
        OrderProjectionDTO readModel = readModelOpt.get();
        
        // Verify consistency
        assertEquals(writeModel.getItems().size(), readModel.itemCount());
        assertEquals(writeModel.getTotalAmount(), readModel.totalAmount());
        assertEquals(writeModel.getStatus(), readModel.status());
    }
    
    @Test
    @DisplayName("should persist and retrieve events correctly")
    void shouldPersistAndRetrieveEventsCorrectly() {
        UUID customerId = UUID.randomUUID();
        UUID orderId = orderService.createOrder(new CreateOrderCommand(customerId));
        
        orderService.addItem(new AddItemCommand(orderId, UUID.randomUUID(), 5, BigDecimal.TEN));
        orderService.submitOrder(new SubmitOrderCommand(orderId));
        
        // Retrieve events
        var events = eventStore.getEvents(orderId);
        
        assertEquals(3, events.size());
        assertInstanceOf(OrderCreatedEvent.class, events.get(0));
        assertInstanceOf(OrderItemAddedEvent.class, events.get(1));
        assertInstanceOf(OrderSubmittedEvent.class, events.get(2));
    }
    
    @Test
    @DisplayName("should handle concurrent modifications correctly")
    void shouldHandleConcurrentModificationsCorrectly() throws InterruptedException, ExecutionException {
        UUID customerId = UUID.randomUUID();
        UUID orderId = orderService.createOrder(new CreateOrderCommand(customerId));
        
        // Two concurrent attempts to add items
        CompletableFuture<Void> future1 = CompletableFuture.runAsync(() -> {
            try {
                orderService.addItem(new AddItemCommand(orderId, UUID.randomUUID(), 5, BigDecimal.TEN));
            } catch (Exception e) {
                // Expected: one might fail due to concurrency
            }
        });
        
        CompletableFuture<Void> future2 = CompletableFuture.runAsync(() -> {
            try {
                orderService.addItem(new AddItemCommand(orderId, UUID.randomUUID(), 3, BigDecimal.valueOf(20)));
            } catch (Exception e) {
                // Expected: one might fail due to concurrency
            }
        });
        
        future1.get();
        future2.get();
        
        Thread.sleep(500);
        
        // At least one should succeed
        OrderAggregate order = aggregateRepository.load(orderId, OrderAggregate.class).orElseThrow();
        assertTrue(order.getItems().size() >= 1);
    }
}

