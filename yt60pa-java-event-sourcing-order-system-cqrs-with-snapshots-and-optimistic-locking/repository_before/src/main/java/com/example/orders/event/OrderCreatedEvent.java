package com.example.orders.event;

public class OrderCreatedEvent {
    public String orderId;
    public String customerId;
    public long timestamp;

    public OrderCreatedEvent() {}

    public OrderCreatedEvent(String orderId, String customerId) {
        this.orderId = orderId;
        this.customerId = customerId;
        this.timestamp = System.currentTimeMillis();
    }
}
