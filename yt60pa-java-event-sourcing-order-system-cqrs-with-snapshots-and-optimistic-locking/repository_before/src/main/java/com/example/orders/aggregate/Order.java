package com.example.orders.aggregate;

import com.example.orders.event.*;
import com.fasterxml.jackson.databind.ObjectMapper;

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
    private String shippingAddress;
    private List<Object> pendingEvents = new ArrayList<>();

    public Order() {
        this.status = "DRAFT";
    }

    public void createOrder(String orderId, String customerId) {
        this.id = orderId;
        this.customerId = customerId;
        this.status = "CREATED";
        pendingEvents.add(new OrderCreatedEvent(orderId, customerId));
    }

    public void addItem(String productId, int quantity, BigDecimal price) {
        if (!"CREATED".equals(status) && !"DRAFT".equals(status)) {
            throw new IllegalStateException("Cannot add items to order in status: " + status);
        }
        OrderItem item = items.get(productId);
        if (item != null) {
            item.setQuantity(item.getQuantity() + quantity);
        } else {
            items.put(productId, new OrderItem(productId, quantity, price));
        }
        pendingEvents.add(new ItemAddedEvent(id, productId, quantity, price));
    }

    public void removeItem(String productId) {
        if (!"CREATED".equals(status) && !"DRAFT".equals(status)) {
            throw new IllegalStateException("Cannot remove items from order in status: " + status);
        }
        if (!items.containsKey(productId)) {
            throw new IllegalArgumentException("Product not found in order: " + productId);
        }
        OrderItem item = items.get(productId);
        items.remove(productId);
        pendingEvents.add(new ItemRemovedEvent(id, productId, item.getQuantity(), item.getPrice()));
    }

    public void submit(String shippingAddress) {
        if (!"CREATED".equals(status)) {
            throw new IllegalStateException("Cannot submit order in status: " + status);
        }
        if (items.isEmpty()) {
            throw new IllegalStateException("Cannot submit empty order");
        }
        this.shippingAddress = shippingAddress;
        this.status = "SUBMITTED";
        pendingEvents.add(new OrderSubmittedEvent(id, shippingAddress));
    }

    public void cancel(String reason) {
        if ("CANCELLED".equals(status) || "SHIPPED".equals(status)) {
            throw new IllegalStateException("Cannot cancel order in status: " + status);
        }
        this.status = "CANCELLED";
        pendingEvents.add(new OrderCancelledEvent(id, reason));
    }

    public void receivePayment(BigDecimal amount, String transactionId) {
        if (!"SUBMITTED".equals(status)) {
            throw new IllegalStateException("Cannot receive payment for order in status: " + status);
        }
        this.status = "PAID";
        pendingEvents.add(new PaymentReceivedEvent(id, amount, transactionId));
    }

    public void ship(String trackingNumber) {
        if (!"PAID".equals(status)) {
            throw new IllegalStateException("Cannot ship order in status: " + status);
        }
        this.status = "SHIPPED";
        pendingEvents.add(new OrderShippedEvent(id, trackingNumber));
    }

    public void apply(Event event, ObjectMapper objectMapper) {
        try {
            switch (event.getEventType()) {
                case "OrderCreatedEvent":
                    OrderCreatedEvent created = objectMapper.readValue(event.getPayload(), OrderCreatedEvent.class);
                    this.id = created.orderId;
                    this.customerId = created.customerId;
                    this.status = "CREATED";
                    break;
                case "ItemAddedEvent":
                    ItemAddedEvent itemAdded = objectMapper.readValue(event.getPayload(), ItemAddedEvent.class);
                    OrderItem existingItem = items.get(itemAdded.productId);
                    if (existingItem != null) {
                        existingItem.setQuantity(existingItem.getQuantity() + itemAdded.quantity);
                    } else {
                        items.put(itemAdded.productId, new OrderItem(itemAdded.productId, itemAdded.quantity, itemAdded.price));
                    }
                    break;
                case "ItemRemovedEvent":
                    ItemRemovedEvent itemRemoved = objectMapper.readValue(event.getPayload(), ItemRemovedEvent.class);
                    items.remove(itemRemoved.productId);
                    break;
                case "OrderSubmittedEvent":
                    OrderSubmittedEvent submitted = objectMapper.readValue(event.getPayload(), OrderSubmittedEvent.class);
                    this.shippingAddress = submitted.shippingAddress;
                    this.status = "SUBMITTED";
                    break;
                case "OrderCancelledEvent":
                    this.status = "CANCELLED";
                    break;
                case "PaymentReceivedEvent":
                    this.status = "PAID";
                    break;
                case "OrderShippedEvent":
                    this.status = "SHIPPED";
                    break;
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to apply event", e);
        }
    }

    public BigDecimal getTotalAmount() {
        return items.values().stream()
            .map(item -> item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity())))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public int getItemCount() {
        return items.size();
    }

    public List<Object> getPendingEvents() {
        return pendingEvents;
    }

    public void clearPendingEvents() {
        pendingEvents.clear();
    }

    public String getId() { return id; }
    public String getCustomerId() { return customerId; }
    public String getStatus() { return status; }
    public Map<String, OrderItem> getItems() { return items; }
    public String getShippingAddress() { return shippingAddress; }
}
