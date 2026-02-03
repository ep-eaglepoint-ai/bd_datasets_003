package com.example.eventsourcing.domain.order;

import com.example.eventsourcing.domain.DomainEvent;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for OrderAggregate.
 * Tests all commands and state transitions.
 */
@DisplayName("OrderAggregate Tests")
class OrderAggregateTest {
    
    @Nested
    @DisplayName("CreateOrder Command")
    class CreateOrderTests {
        
        @Test
        @DisplayName("Should create a new order with correct initial state")
        void shouldCreateOrderWithCorrectState() {
            String customerId = "customer-123";
            
            OrderAggregate aggregate = OrderAggregate.createOrder(customerId);
            
            assertNotNull(aggregate.getAggregateId());
            assertEquals(customerId, aggregate.getCustomerId());
            assertEquals(OrderStatus.DRAFT, aggregate.getStatus());
            assertEquals(BigDecimal.ZERO, aggregate.getTotalAmount());
            assertEquals(0, aggregate.getItemCount());
            assertNotNull(aggregate.getCreatedAt());
            assertEquals(1, aggregate.getUncommittedEventCount());
        }
        
        @Test
        @DisplayName("Should generate OrderCreatedEvent when creating order")
        void shouldGenerateOrderCreatedEvent() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            
            assertEquals(1, aggregate.getUncommittedEvents().size());
            Object event = aggregate.getUncommittedEvents().get(0);
            assertTrue(event instanceof OrderCreatedEvent);
            
            OrderCreatedEvent createdEvent = (OrderCreatedEvent) event;
            assertEquals(aggregate.getAggregateId(), createdEvent.getAggregateId());
            assertEquals(1L, createdEvent.getVersion());
            assertEquals("customer-123", createdEvent.getCustomerId());
        }
        
        @Test
        @DisplayName("Should have uncommitted changes after creation")
        void shouldHaveUncommittedChanges() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            
            assertTrue(aggregate.hasUncommittedChanges());
        }
    }
    
    @Nested
    @DisplayName("AddItem Command")
    class AddItemTests {
        
        @Test
        @DisplayName("Should add item to order in DRAFT status")
        void shouldAddItemToDraftOrder() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            aggregate.markEventsAsCommitted(); // Clear uncommitted events
            
            aggregate.addItem("product-1", "Laptop", 1, new BigDecimal("999.99"));
            
            assertEquals(1, aggregate.getItemCount());
            assertEquals(new BigDecimal("999.99"), aggregate.getTotalAmount());
            assertEquals(1, aggregate.getUncommittedEventCount());
        }
        
        @Test
        @DisplayName("Should accumulate total amount when adding multiple items")
        void shouldAccumulateTotalAmount() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            aggregate.markEventsAsCommitted();
            
            aggregate.addItem("product-1", "Laptop", 1, new BigDecimal("999.99"));
            aggregate.addItem("product-2", "Mouse", 2, new BigDecimal("29.99"));
            
            BigDecimal expectedTotal = new BigDecimal("999.99").add(new BigDecimal("59.98"));
            assertEquals(expectedTotal, aggregate.getTotalAmount());
            assertEquals(2, aggregate.getItemCount());
        }
        
        @Test
        @DisplayName("Should not add item to submitted order")
        void shouldNotAddItemToSubmittedOrder() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            aggregate.markEventsAsCommitted();
            aggregate.addItem("product-1", "Laptop", 1, new BigDecimal("999.99"));
            aggregate.submitOrder();
            aggregate.markEventsAsCommitted();
            
            assertThrows(IllegalStateException.class, () -> 
                aggregate.addItem("product-2", "Mouse", 1, new BigDecimal("29.99"))
            );
        }
        
        @Test
        @DisplayName("Should validate item parameters")
        void shouldValidateItemParameters() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            aggregate.markEventsAsCommitted();
            
            assertThrows(IllegalArgumentException.class, () -> 
                aggregate.addItem(null, "Laptop", 1, new BigDecimal("999.99"))
            );
            assertThrows(IllegalArgumentException.class, () -> 
                aggregate.addItem("product-1", null, 1, new BigDecimal("999.99"))
            );
            assertThrows(IllegalArgumentException.class, () -> 
                aggregate.addItem("product-1", "Laptop", 0, new BigDecimal("999.99"))
            );
            assertThrows(IllegalArgumentException.class, () -> 
                aggregate.addItem("product-1", "Laptop", 1, null)
            );
        }
    }
    
    @Nested
    @DisplayName("RemoveItem Command")
    class RemoveItemTests {
        
        @Test
        @DisplayName("Should remove item from order")
        void shouldRemoveItem() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            aggregate.markEventsAsCommitted();
            aggregate.addItem("product-1", "Laptop", 1, new BigDecimal("999.99"));
            aggregate.addItem("product-2", "Mouse", 1, new BigDecimal("29.99"));
            aggregate.markEventsAsCommitted();
            
            aggregate.removeItem("product-1");
            
            assertEquals(1, aggregate.getItemCount());
            assertEquals(new BigDecimal("29.99"), aggregate.getTotalAmount());
        }
        
        @Test
        @DisplayName("Should not remove non-existent item")
        void shouldNotRemoveNonExistentItem() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            aggregate.markEventsAsCommitted();
            
            // Should not throw, just do nothing
            aggregate.removeItem("non-existent-product");
            
            assertEquals(0, aggregate.getItemCount());
            assertEquals(0, aggregate.getUncommittedEventCount());
        }
        
        @Test
        @DisplayName("Should not remove item from submitted order")
        void shouldNotRemoveItemFromSubmittedOrder() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            aggregate.markEventsAsCommitted();
            aggregate.addItem("product-1", "Laptop", 1, new BigDecimal("999.99"));
            aggregate.submitOrder();
            aggregate.markEventsAsCommitted();
            
            assertThrows(IllegalStateException.class, () -> 
                aggregate.removeItem("product-1")
            );
        }
    }
    
    @Nested
    @DisplayName("SubmitOrder Command")
    class SubmitOrderTests {
        
        @Test
        @DisplayName("Should submit order with items")
        void shouldSubmitOrderWithItems() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            aggregate.markEventsAsCommitted();
            aggregate.addItem("product-1", "Laptop", 1, new BigDecimal("999.99"));
            aggregate.markEventsAsCommitted();
            
            aggregate.submitOrder();
            
            assertEquals(OrderStatus.SUBMITTED, aggregate.getStatus());
            assertNotNull(aggregate.getSubmittedAt());
            assertEquals(1, aggregate.getUncommittedEventCount());
        }
        
        @Test
        @DisplayName("Should not submit empty order")
        void shouldNotSubmitEmptyOrder() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            aggregate.markEventsAsCommitted();
            
            assertThrows(IllegalStateException.class, () -> aggregate.submitOrder());
        }
        
        @Test
        @DisplayName("Should not submit already submitted order")
        void shouldNotSubmitAlreadySubmittedOrder() {
            OrderAggregate aggregate = OrderAggregate.createOrder("customer-123");
            aggregate.markEventsAsCommitted();
            aggregate.addItem("product-1", "Laptop", 1, new BigDecimal("999.99"));
            aggregate.submitOrder();
            aggregate.markEventsAsCommitted();
            
            assertThrows(IllegalStateException.class, () -> aggregate.submitOrder());
        }
    }
    
    @Nested
    @DisplayName("Event Replay")
    class EventReplayTests {
        
        @Test
        @DisplayName("Should rebuild state from events")
        void shouldRebuildStateFromEvents() {
            OrderAggregate aggregate = new OrderAggregate();
            
            OrderCreatedEvent createdEvent = new OrderCreatedEvent(
                    "order-123", 1L, "customer-123", BigDecimal.ZERO);
            OrderItemAddedEvent itemAddedEvent = new OrderItemAddedEvent(
                    "order-123", 2L, "product-1", "Laptop", 1, 
                    new BigDecimal("999.99"), new BigDecimal("999.99"));
            OrderSubmittedEvent submittedEvent = new OrderSubmittedEvent(
                    "order-123", 3L, "customer-123", new BigDecimal("999.99"), 1);
            
            aggregate.apply(createdEvent);
            aggregate.apply(itemAddedEvent);
            aggregate.apply(submittedEvent);
            
            assertEquals("order-123", aggregate.getAggregateId());
            assertEquals("customer-123", aggregate.getCustomerId());
            assertEquals(OrderStatus.SUBMITTED, aggregate.getStatus());
            assertEquals(new BigDecimal("999.99"), aggregate.getTotalAmount());
            assertEquals(1, aggregate.getItemCount());
            assertEquals(3L, aggregate.getVersion());
        }
        
        @Test
        @DisplayName("Should produce identical state after full replay")
        void shouldProduceIdenticalStateAfterFullReplay() {
            // Create and modify an aggregate
            OrderAggregate original = OrderAggregate.createOrder("customer-123");
            original.markEventsAsCommitted();
            original.addItem("product-1", "Laptop", 1, new BigDecimal("999.99"));
            original.addItem("product-2", "Mouse", 2, new BigDecimal("29.99"));
            original.submitOrder();
            
            // Get all events
            java.util.List<DomainEvent> events = new java.util.ArrayList<>();
            events.addAll(original.getUncommittedEvents());
            
            // Create new aggregate and replay events
            OrderAggregate replayed = new OrderAggregate();
            for (DomainEvent event : events) {
                replayed.apply((com.example.eventsourcing.domain.DomainEvent) event);
            }
            
            // Verify state is identical
            assertEquals(original.getStatus(), replayed.getStatus());
            assertEquals(original.getTotalAmount(), replayed.getTotalAmount());
            assertEquals(original.getItemCount(), replayed.getItemCount());
            assertEquals(original.getCustomerId(), replayed.getCustomerId());
        }
    }
}
