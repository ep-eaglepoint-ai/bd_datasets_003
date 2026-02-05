package com.example.eventsourcing.domain.order;

import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.infrastructure.AggregateRepository;
import com.example.eventsourcing.infrastructure.EventStore;
import com.example.eventsourcing.infrastructure.persistence.EventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration test verifying that event replay produces identical aggregate state.
 * This validates the Definition of Done requirement: deterministic replay.
 * 
 * The test creates an aggregate, performs operations, saves it, then rebuilds
 * the aggregate from events and verifies the state matches exactly.
 */
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@DisplayName("Deterministic event replay tests")
class DeterministicReplayTest {

    @Autowired
    private AggregateRepository<OrderAggregate, DomainEvent> aggregateRepository;

    @Autowired
    private EventStore eventStore;

    @Autowired
    private EventRepository eventRepository;

    @BeforeEach
    void cleanDatabase() {
        eventRepository.deleteAll();
    }

    @Test
    @DisplayName("Event replay should produce identical aggregate state")
    void eventReplayShouldProduceIdenticalState() {
        // Create an order and perform multiple operations
        OrderAggregate original = OrderAggregate.createOrder("customer-1");
        String orderId = original.getAggregateId();
        
        // Capture initial state
        String originalCustomerId = original.getCustomerId();
        OrderStatus originalStatus = original.getStatus();
        BigDecimal originalTotal = original.getTotalAmount();
        int originalItemCount = original.getItemCount();
        
        // Add items
        original.addItem("p1", "Product 1", 2, new BigDecimal("10.00"));
        original.addItem("p2", "Product 2", 1, new BigDecimal("20.00"));
        
        // Capture state after adding items
        BigDecimal totalAfterAdd = original.getTotalAmount();
        int itemCountAfterAdd = original.getItemCount();
        
        // Remove an item
        original.removeItem("p1");
        
        // Capture final state before save
        BigDecimal finalTotal = original.getTotalAmount();
        int finalItemCount = original.getItemCount();
        List<String> finalProductIds = original.getItems().keySet().stream()
                .sorted()
                .toList();
        
        // Save the aggregate - save() handles all uncommitted events including the initial one
        aggregateRepository.save(original);
        
        // Now rebuild the aggregate from events
        OrderAggregate rebuilt = aggregateRepository.load(orderId);
        
        // Verify the rebuilt aggregate matches the final state exactly
        assertEquals(originalCustomerId, rebuilt.getCustomerId(), 
                "Customer ID should match after replay");
        assertEquals(originalStatus, rebuilt.getStatus(), 
                "Status should match after replay (should still be DRAFT after add/remove operations)");
        assertEquals(0, finalTotal.compareTo(rebuilt.getTotalAmount()), 
                "Final total should match after replay");
        assertEquals(finalItemCount, rebuilt.getItemCount(), 
                "Final item count should match after replay");
        
        // Verify items match
        List<String> rebuiltProductIds = rebuilt.getItems().keySet().stream()
                .sorted()
                .toList();
        assertEquals(finalProductIds, rebuiltProductIds, 
                "Product IDs should match after replay");
        
        // Verify item details match
        if (!finalProductIds.isEmpty()) {
            String productId = finalProductIds.get(0);
            OrderItem originalItem = original.getItems().get(productId);
            OrderItem rebuiltItem = rebuilt.getItems().get(productId);
            
            assertNotNull(originalItem, "Original item should exist");
            assertNotNull(rebuiltItem, "Rebuilt item should exist");
            assertEquals(originalItem.getProductId(), rebuiltItem.getProductId());
            assertEquals(originalItem.getProductName(), rebuiltItem.getProductName());
            assertEquals(originalItem.getQuantity(), rebuiltItem.getQuantity());
            assertEquals(0, originalItem.getUnitPrice().compareTo(rebuiltItem.getUnitPrice()));
        }
    }

    @Test
    @DisplayName("Multiple replays should produce identical state")
    void multipleReplaysShouldProduceIdenticalState() {
        // Create and save an order with operations
        OrderAggregate order = OrderAggregate.createOrder("customer-1");
        String orderId = order.getAggregateId();
        
        order.addItem("p1", "Product 1", 1, new BigDecimal("15.00"));
        order.addItem("p2", "Product 2", 2, new BigDecimal("25.00"));
        order.submitOrder();
        
        // Save all events at once - save() handles the initial event correctly
        aggregateRepository.save(order);
        
        // Rebuild multiple times and verify consistency
        OrderAggregate rebuilt1 = aggregateRepository.load(orderId);
        OrderAggregate rebuilt2 = aggregateRepository.load(orderId);
        OrderAggregate rebuilt3 = aggregateRepository.load(orderId);
        
        // All rebuilds should produce identical state
        assertEquals(rebuilt1.getCustomerId(), rebuilt2.getCustomerId());
        assertEquals(rebuilt2.getCustomerId(), rebuilt3.getCustomerId());
        
        assertEquals(0, rebuilt1.getTotalAmount().compareTo(rebuilt2.getTotalAmount()));
        assertEquals(0, rebuilt2.getTotalAmount().compareTo(rebuilt3.getTotalAmount()));
        
        assertEquals(rebuilt1.getItemCount(), rebuilt2.getItemCount());
        assertEquals(rebuilt2.getItemCount(), rebuilt3.getItemCount());
        
        assertEquals(rebuilt1.getStatus(), rebuilt2.getStatus());
        assertEquals(rebuilt2.getStatus(), rebuilt3.getStatus());
        
        // Verify all have the same items
        assertEquals(rebuilt1.getItems().keySet(), rebuilt2.getItems().keySet());
        assertEquals(rebuilt2.getItems().keySet(), rebuilt3.getItems().keySet());
    }

    @Test
    @DisplayName("Replay should handle complex event sequences correctly")
    void replayShouldHandleComplexEventSequences() {
        // Create order with complex sequence: add, remove, add again, submit
        OrderAggregate order = OrderAggregate.createOrder("customer-1");
        String orderId = order.getAggregateId();
        
        order.addItem("p1", "Product 1", 2, new BigDecimal("10.00"));
        order.addItem("p2", "Product 2", 1, new BigDecimal("20.00"));
        order.removeItem("p1");
        order.addItem("p3", "Product 3", 3, new BigDecimal("15.00"));
        order.submitOrder();
        
        // Save all changes - save() handles all uncommitted events including the initial one
        aggregateRepository.save(order);
        
        // Rebuild and verify
        OrderAggregate rebuilt = aggregateRepository.load(orderId);
        
        assertEquals(OrderStatus.SUBMITTED, rebuilt.getStatus());
        assertEquals(2, rebuilt.getItemCount()); // p2 and p3, p1 was removed
        assertFalse(rebuilt.getItems().containsKey("p1"), "p1 should not be in items");
        assertTrue(rebuilt.getItems().containsKey("p2"), "p2 should be in items");
        assertTrue(rebuilt.getItems().containsKey("p3"), "p3 should be in items");
        
        // Verify total: p2 (1 * 20) + p3 (3 * 15) = 20 + 45 = 65
        assertEquals(0, new BigDecimal("65.00").compareTo(rebuilt.getTotalAmount()));
    }
}

