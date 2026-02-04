package com.example.orders.aggregate;

import com.example.orders.event.*;
import com.example.orders.event.SnapshotRepository.Snapshot;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Order {

    private String id;
    private String customerId;
    private String status;
    private Map<String, OrderItem> items = new HashMap<>();
    private long version = 0; // Current version of the aggregate
    @com.fasterxml.jackson.annotation.JsonIgnore
    private final List<Event> newEvents = new ArrayList<>();

    public Order() {
        this.status = "DRAFT";
    }

    // Command methods
    public void createOrder(String orderId, String customerId) {
        if (this.id != null) {
            throw new IllegalStateException("Order already exists");
        }
        applyChange(new OrderCreatedEvent(orderId, customerId));
    }

    public void addItem(String productId, int quantity, BigDecimal price) {
        if (!"CREATED".equals(status) && !"DRAFT".equals(status)) {
            throw new IllegalStateException("Cannot add items to order in status: " + status);
        }
        if (quantity <= 0) {
            throw new IllegalArgumentException("Quantity must be positive, got: " + quantity);
        }
        applyChange(new ItemAddedEvent(id, productId, quantity, price));
    }

    public void removeItem(String productId) {
        if (!"CREATED".equals(status) && !"DRAFT".equals(status)) {
            throw new IllegalStateException("Cannot remove items from order in status: " + status);
        }
        if (!items.containsKey(productId)) {
            throw new IllegalStateException("Item not found in order: " + productId);
        }
        applyChange(new ItemRemovedEvent(id, productId));
    }

    public void submit(String shippingAddress) {
        if (!"CREATED".equals(status)) {
            throw new IllegalStateException("Cannot submit order in status: " + status);
        }
        if (items.isEmpty()) {
            throw new IllegalStateException("Cannot submit empty order");
        }
        applyChange(new OrderSubmittedEvent(id, shippingAddress));
    }

    public void cancel(String reason) {
        if ("SHIPPED".equals(status) || "CANCELLED".equals(status)) {
            throw new IllegalStateException("Cannot cancel order in status: " + status);
        }
        applyChange(new OrderCancelledEvent(id, reason));
    }

    public void paymentReceived(BigDecimal amount, String transactionId) {
        if (!"SUBMITTED".equals(status)) {
             throw new IllegalStateException("Cannot receive payment for order in status: " + status);
        }
        applyChange(new PaymentReceivedEvent(id, amount, transactionId));
    }

    public void ship(String trackingNumber) {
        // Assume simplified flow where payment is not strictly required for this demo unless specified
        // But usually payment should be received. Let's say we can ship if submitted or paid.
        // Requirement didn't strictly specify state machine for shipping, checking status.
        if (!"SUBMITTED".equals(status) && !"PAID".equals(status)) { // Assuming PAID state if we had it, but let's stick to existing events
             // PaymentReceivedEvent doesn't explicitly change status in my previous thought, let's see.
             // If PaymentReceivedEvent is applied, we should probably update status to PAID or similar?
             // But the Event handlers below define the transitions.
        }
        // Let's enforce Submitted at least.
        if ("CREATED".equals(status) || "DRAFT".equals(status) || "CANCELLED".equals(status)) {
             throw new IllegalStateException("Cannot ship order in status: " + status);
        }
        applyChange(new OrderShippedEvent(id, trackingNumber));
    }
    
    // Event Sourcing Machinery
    private void applyChange(Event event) {
        event.setAggregateId(this.id != null ? this.id : ((OrderCreatedEvent)event).orderId);
        // Version will be set by Repository or CommandHandler before saving, 
        // but optimistically we increment it here for internal consistency checks if needed?
        // Actually, the new version will be (currentVersion + 1). 
        // We defer version assignment to the persistence or store logic, or we calculate it here.
        // Rule 11: "After applying an event, the aggregate's internal version must be updated to match the event's version"
        // But we are generating NEW events here.
        
        apply(event);
        newEvents.add(event);
    }
    
    public void replay(List<Event> events) {
        for (Event event : events) {
            apply(event);
        }
    }

    private void apply(Event event) {
        if (event instanceof OrderCreatedEvent e) {
            this.id = e.orderId;
            this.customerId = e.customerId;
            this.status = "CREATED";
        } else if (event instanceof ItemAddedEvent e) {
             OrderItem item = items.getOrDefault(e.productId, new OrderItem(e.productId, 0, e.price));
             item.setQuantity(item.getQuantity() + e.quantity);
             items.put(e.productId, item);
        } else if (event instanceof ItemRemovedEvent e) {
            items.remove(e.productId);
        } else if (event instanceof OrderSubmittedEvent e) {
            this.status = "SUBMITTED";
        } else if (event instanceof OrderCancelledEvent e) {
            this.status = "CANCELLED";
        } else if (event instanceof OrderShippedEvent e) {
            this.status = "SHIPPED";
        } else if (event instanceof PaymentReceivedEvent e) {
            // potentially update status to PAID
             this.status = "PAID";
        }
        
        // Update version
        // When replaying, the event has a version.
        // When generating new events, they don't have a version yet until saved?
        // Logic: The version of the aggregate is the version of the last applied event.
        if (event.getVersion() > 0) {
            this.version = event.getVersion();
        }
    }
    
    // Snapshotting
    public Snapshot<Order> createSnapshot() {
        return new Snapshot<>(this, version);
    }

    public static Order restore(Snapshot<Order> snapshot) {
        Order order = snapshot.aggregate;
        order.version = snapshot.version;
        // The snapshot payload deserialization should handle the map and fields.
        return order;
    }

    // Getters
    public String getId() { return id; }
    public String getStatus() { return status; }
    public Map<String, OrderItem> getItems() { return items; }
    public long getVersion() { return version; }
    public List<Event> getNewEvents() { return newEvents; }
    public void clearNewEvents() { newEvents.clear(); }
    
    // For Jackson deserialization of snapshot
    public void setStatus(String status) { this.status = status; }
    public void setItems(Map<String, OrderItem> items) { this.items = items; }
    public void setVersion(long version) { this.version = version; }
}
