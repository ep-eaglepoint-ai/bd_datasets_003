package com.example.eventsourcing.domain.order;

import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.exception.EmptyOrderException;
import com.example.eventsourcing.exception.InvalidOrderStatusException;
import com.example.eventsourcing.exception.ItemNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for OrderAggregate.
 */
@DisplayName("OrderAggregate Unit Tests")
class OrderAggregateTest {
    
    private OrderAggregate order;
    private UUID aggregateId;
    private UUID customerId;
    
    @BeforeEach
    void setUp() {
        aggregateId = UUID.randomUUID();
        customerId = UUID.randomUUID();
        order = new OrderAggregate(aggregateId);
    }
    
    @Nested
    @DisplayName("Create Order Tests")
    class CreateOrderTests {
        
        @Test
        @DisplayName("should create order with DRAFT status")
        void shouldCreateOrderWithDraftStatus() {
            order.createOrder(customerId);
            
            assertEquals(OrderStatus.DRAFT, order.getStatus());
            assertEquals(customerId, order.getCustomerId());
            assertEquals(1L, order.getVersion());
            assertTrue(order.getItems().isEmpty());
            assertEquals(BigDecimal.ZERO, order.getTotalAmount());
        }
        
        @Test
        @DisplayName("should generate OrderCreatedEvent")
        void shouldGenerateOrderCreatedEvent() {
            order.createOrder(customerId);
            
            List<DomainEvent> events = order.getUncommittedEvents();
            assertEquals(1, events.size());
            assertInstanceOf(OrderCreatedEvent.class, events.get(0));
            
            OrderCreatedEvent event = (OrderCreatedEvent) events.get(0);
            assertEquals(aggregateId, event.aggregateId());
            assertEquals(customerId, event.customerId());
            assertEquals(1L, event.version());
        }
        
        @Test
        @DisplayName("should reject null customer ID")
        void shouldRejectNullCustomerId() {
            assertThrows(NullPointerException.class, () -> order.createOrder(null));
        }
        
        @Test
        @DisplayName("should reject duplicate creation")
        void shouldRejectDuplicateCreation() {
            order.createOrder(customerId);
            
            assertThrows(IllegalStateException.class, () -> order.createOrder(customerId));
        }
        
        @Test
        @DisplayName("should set created timestamp")
        void shouldSetCreatedTimestamp() {
            order.createOrder(customerId);
            
            assertNotNull(order.getCreatedAt());
        }
    }
    
    @Nested
    @DisplayName("Add Item Tests")
    class AddItemTests {
        
        private UUID productId;
        
        @BeforeEach
        void createOrder() {
            order.createOrder(customerId);
            order.markEventsAsCommitted();
            productId = UUID.randomUUID();
        }
        
        @Test
        @DisplayName("should add item to DRAFT order")
        void shouldAddItemToDraftOrder() {
            BigDecimal unitPrice = BigDecimal.valueOf(100.00);
            
            order.addItem(productId, 5, unitPrice);
            
            assertEquals(1, order.getItems().size());
            assertTrue(order.getItems().containsKey(productId));
            assertEquals(BigDecimal.valueOf(500.00), order.getTotalAmount());
        }
        
        @Test
        @DisplayName("should generate OrderItemAddedEvent")
        void shouldGenerateOrderItemAddedEvent() {
            order.addItem(productId, 5, BigDecimal.TEN);
            
            List<DomainEvent> events = order.getUncommittedEvents();
            assertEquals(1, events.size());
            assertInstanceOf(OrderItemAddedEvent.class, events.get(0));
            
            OrderItemAddedEvent event = (OrderItemAddedEvent) events.get(0);
            assertEquals(productId, event.productId());
            assertEquals(5, event.quantity());
            assertEquals(BigDecimal.TEN, event.unitPrice());
        }
        
        @Test
        @DisplayName("should reject item addition to SUBMITTED order")
        void shouldRejectAddItemToSubmittedOrder() {
            order.addItem(productId, 1, BigDecimal.TEN);
            order.markEventsAsCommitted();
            order.submitOrder();
            
            UUID newProductId = UUID.randomUUID();
            assertThrows(InvalidOrderStatusException.class, 
                () -> order.addItem(newProductId, 1, BigDecimal.TEN));
        }
        
        @Test
        @DisplayName("should reject zero quantity")
        void shouldRejectZeroQuantity() {
            assertThrows(IllegalArgumentException.class, 
                () -> order.addItem(productId, 0, BigDecimal.TEN));
        }
        
        @Test
        @DisplayName("should reject negative quantity")
        void shouldRejectNegativeQuantity() {
            assertThrows(IllegalArgumentException.class, 
                () -> order.addItem(productId, -5, BigDecimal.TEN));
        }
        
        @Test
        @DisplayName("should reject negative unit price")
        void shouldRejectNegativeUnitPrice() {
            assertThrows(IllegalArgumentException.class, 
                () -> order.addItem(productId, 5, BigDecimal.valueOf(-10)));
        }
        
        @Test
        @DisplayName("should reject zero unit price")
        void shouldRejectZeroUnitPrice() {
            assertThrows(IllegalArgumentException.class, 
                () -> order.addItem(productId, 5, BigDecimal.ZERO));
        }
        
        @Test
        @DisplayName("should reject null product ID")
        void shouldRejectNullProductId() {
            assertThrows(NullPointerException.class, 
                () -> order.addItem(null, 5, BigDecimal.TEN));
        }
        
        @Test
        @DisplayName("should reject null unit price")
        void shouldRejectNullUnitPrice() {
            assertThrows(NullPointerException.class, 
                () -> order.addItem(productId, 5, null));
        }
        
        @Test
        @DisplayName("should update item if product already exists")
        void shouldUpdateItemIfProductAlreadyExists() {
            order.addItem(productId, 5, BigDecimal.TEN);
            order.markEventsAsCommitted();
            
            // Add same product again
            order.addItem(productId, 3, BigDecimal.valueOf(20));
            
            // Should replace, not accumulate
            assertEquals(1, order.getItems().size());
            OrderItem item = order.getItems().get(productId);
            assertEquals(3, item.quantity());
            assertEquals(BigDecimal.valueOf(20), item.unitPrice());
        }
        
        @Test
        @DisplayName("should calculate total correctly with multiple items")
        void shouldCalculateTotalCorrectlyWithMultipleItems() {
            UUID product1 = UUID.randomUUID();
            UUID product2 = UUID.randomUUID();
            
            order.addItem(product1, 5, BigDecimal.valueOf(100));
            order.addItem(product2, 3, BigDecimal.valueOf(50));
            
            assertEquals(BigDecimal.valueOf(650), order.getTotalAmount());
        }
    }
    
    @Nested
    @DisplayName("Remove Item Tests")
    class RemoveItemTests {
        
        private UUID productId;
        
        @BeforeEach
        void createOrderWithItem() {
            order.createOrder(customerId);
            productId = UUID.randomUUID();
            order.addItem(productId, 5, BigDecimal.TEN);
            order.markEventsAsCommitted();
        }
        
        @Test
        @DisplayName("should remove item from DRAFT order")
        void shouldRemoveItemFromDraftOrder() {
            order.removeItem(productId);
            
            assertTrue(order.getItems().isEmpty());
            assertEquals(BigDecimal.ZERO, order.getTotalAmount());
        }
        
        @Test
        @DisplayName("should generate OrderItemRemovedEvent")
        void shouldGenerateOrderItemRemovedEvent() {
            order.removeItem(productId);
            
            List<DomainEvent> events = order.getUncommittedEvents();
            assertEquals(1, events.size());
            assertInstanceOf(OrderItemRemovedEvent.class, events.get(0));
            
            OrderItemRemovedEvent event = (OrderItemRemovedEvent) events.get(0);
            assertEquals(productId, event.productId());
        }
        
        @Test
        @DisplayName("should reject removal of non-existent item")
        void shouldRejectRemovalOfNonExistentItem() {
            UUID nonExistentProduct = UUID.randomUUID();
            
            assertThrows(ItemNotFoundException.class, 
                () -> order.removeItem(nonExistentProduct));
        }
        
        @Test
        @DisplayName("should reject item removal from SUBMITTED order")
        void shouldRejectRemoveItemFromSubmittedOrder() {
            order.submitOrder();
            
            assertThrows(InvalidOrderStatusException.class, 
                () -> order.removeItem(productId));
        }
        
        @Test
        @DisplayName("should recalculate total after removal")
        void shouldRecalculateTotalAfterRemoval() {
            UUID product2 = UUID.randomUUID();
            order.addItem(product2, 3, BigDecimal.valueOf(20));
            order.markEventsAsCommitted();
            
            order.removeItem(productId);
            
            assertEquals(BigDecimal.valueOf(60), order.getTotalAmount());
            assertEquals(1, order.getItems().size());
        }
    }
    
    @Nested
    @DisplayName("Submit Order Tests")
    class SubmitOrderTests {
        
        @BeforeEach
        void createOrderWithItem() {
            order.createOrder(customerId);
            order.addItem(UUID.randomUUID(), 5, BigDecimal.TEN);
            order.markEventsAsCommitted();
        }
        
        @Test
        @DisplayName("should submit order with items")
        void shouldSubmitOrderWithItems() {
            order.submitOrder();
            
            assertEquals(OrderStatus.SUBMITTED, order.getStatus());
            assertNotNull(order.getSubmittedAt());
        }
        
        @Test
        @DisplayName("should generate OrderSubmittedEvent")
        void shouldGenerateOrderSubmittedEvent() {
            order.submitOrder();
            
            List<DomainEvent> events = order.getUncommittedEvents();
            assertEquals(1, events.size());
            assertInstanceOf(OrderSubmittedEvent.class, events.get(0));
        }
        
        @Test
        @DisplayName("should reject submission of empty order")
        void shouldRejectSubmissionOfEmptyOrder() {
            OrderAggregate emptyOrder = new OrderAggregate(UUID.randomUUID());
            emptyOrder.createOrder(customerId);
            
            assertThrows(EmptyOrderException.class, () -> emptyOrder.submitOrder());
        }
        
        @Test
        @DisplayName("should reject duplicate submission")
        void shouldRejectDuplicateSubmission() {
            order.submitOrder();
            order.markEventsAsCommitted();
            
            assertThrows(InvalidOrderStatusException.class, () -> order.submitOrder());
        }
        
        @Test
        @DisplayName("should increment version on submission")
        void shouldIncrementVersionOnSubmission() {
            Long versionBeforeSubmit = order.getVersion();
            order.submitOrder();
            
            assertEquals(versionBeforeSubmit + 1, order.getVersion());
        }
    }
    
    @Nested
    @DisplayName("Event Application and Replay Tests")
    class EventApplicationTests {
        
        @Test
        @DisplayName("should reconstruct state from event history")
        void shouldReconstructStateFromEventHistory() {
            UUID aggregateId = UUID.randomUUID();
            UUID customerId = UUID.randomUUID();
            UUID productId1 = UUID.randomUUID();
            UUID productId2 = UUID.randomUUID();
            
            List<DomainEvent> events = List.of(
                new OrderCreatedEvent(UUID.randomUUID(), aggregateId, 1L, 
                    java.time.Instant.now(), customerId),
                new OrderItemAddedEvent(UUID.randomUUID(), aggregateId, 2L, 
                    java.time.Instant.now(), productId1, 5, BigDecimal.TEN),
                new OrderItemAddedEvent(UUID.randomUUID(), aggregateId, 3L, 
                    java.time.Instant.now(), productId2, 3, BigDecimal.valueOf(20)),
                new OrderSubmittedEvent(UUID.randomUUID(), aggregateId, 4L, 
                    java.time.Instant.now())
            );
            
            OrderAggregate reconstructed = new OrderAggregate(aggregateId);
            reconstructed.loadFromHistory(events);
            
            assertEquals(OrderStatus.SUBMITTED, reconstructed.getStatus());
            assertEquals(2, reconstructed.getItems().size());
            assertEquals(0, BigDecimal.valueOf(110.00).compareTo(reconstructed.getTotalAmount()));
            assertEquals(4L, reconstructed.getVersion());
            assertEquals(customerId, reconstructed.getCustomerId());
        }
        
        @Test
        @DisplayName("should produce identical state on multiple replays")
        void shouldProduceIdenticalStateOnMultipleReplays() {
            UUID aggregateId = UUID.randomUUID();
            List<DomainEvent> events = createEventSequence(aggregateId);
            
            // Replay 1
            OrderAggregate order1 = new OrderAggregate(aggregateId);
            order1.loadFromHistory(events);
            
            // Replay 2
            OrderAggregate order2 = new OrderAggregate(aggregateId);
            order2.loadFromHistory(events);
            
            // Verify identical state
            assertEquals(order1.getStatus(), order2.getStatus());
            assertEquals(order1.getTotalAmount(), order2.getTotalAmount());
            assertEquals(order1.getItems().size(), order2.getItems().size());
            assertEquals(order1.getVersion(), order2.getVersion());
            assertEquals(order1.getCustomerId(), order2.getCustomerId());
        }
        
        @Test
        @DisplayName("should not have uncommitted events after loading from history")
        void shouldNotHaveUncommittedEventsAfterLoadingFromHistory() {
            UUID aggregateId = UUID.randomUUID();
            List<DomainEvent> events = createEventSequence(aggregateId);
            
            OrderAggregate reconstructed = new OrderAggregate(aggregateId);
            reconstructed.loadFromHistory(events);
            
            assertTrue(reconstructed.getUncommittedEvents().isEmpty());
        }
        
        @Test
        @DisplayName("should apply events in correct order")
        void shouldApplyEventsInCorrectOrder() {
            UUID aggregateId = UUID.randomUUID();
            UUID customerId = UUID.randomUUID();
            UUID productId = UUID.randomUUID();
            
            List<DomainEvent> events = List.of(
                new OrderCreatedEvent(UUID.randomUUID(), aggregateId, 1L, 
                    java.time.Instant.now(), customerId),
                new OrderItemAddedEvent(UUID.randomUUID(), aggregateId, 2L, 
                    java.time.Instant.now(), productId, 5, BigDecimal.TEN),
                new OrderItemRemovedEvent(UUID.randomUUID(), aggregateId, 3L, 
                    java.time.Instant.now(), productId)
            );
            
            OrderAggregate reconstructed = new OrderAggregate(aggregateId);
            reconstructed.loadFromHistory(events);
            
            // After adding and removing, order should be empty
            assertTrue(reconstructed.getItems().isEmpty());
            assertEquals(BigDecimal.ZERO, reconstructed.getTotalAmount());
            assertEquals(3L, reconstructed.getVersion());
        }
        
        private List<DomainEvent> createEventSequence(UUID aggregateId) {
            return List.of(
                new OrderCreatedEvent(UUID.randomUUID(), aggregateId, 1L, 
                    java.time.Instant.now(), UUID.randomUUID()),
                new OrderItemAddedEvent(UUID.randomUUID(), aggregateId, 2L, 
                    java.time.Instant.now(), UUID.randomUUID(), 5, BigDecimal.TEN),
                new OrderSubmittedEvent(UUID.randomUUID(), aggregateId, 3L, 
                    java.time.Instant.now())
            );
        }
    }
    
    @Nested
    @DisplayName("Version Management Tests")
    class VersionManagementTests {
        
        @Test
        @DisplayName("should start with version 0")
        void shouldStartWithVersion0() {
            assertEquals(0L, order.getVersion());
        }
        
        @Test
        @DisplayName("should increment version with each event")
        void shouldIncrementVersionWithEachEvent() {
            order.createOrder(customerId);
            assertEquals(1L, order.getVersion());
            
            order.addItem(UUID.randomUUID(), 5, BigDecimal.TEN);
            assertEquals(2L, order.getVersion());
            
            order.submitOrder();
            assertEquals(3L, order.getVersion());
        }
        
        @Test
        @DisplayName("should track correct version after marking events as committed")
        void shouldTrackCorrectVersionAfterMarkingEventsAsCommitted() {
            order.createOrder(customerId);
            Long version = order.getVersion();
            
            order.markEventsAsCommitted();
            
            assertEquals(version, order.getVersion());
        }
    }
}

