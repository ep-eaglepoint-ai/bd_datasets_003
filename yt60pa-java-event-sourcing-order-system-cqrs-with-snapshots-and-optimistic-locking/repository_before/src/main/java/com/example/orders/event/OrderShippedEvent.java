package com.example.orders.event;

public class OrderShippedEvent {
    public String orderId;
    public String trackingNumber;

    public OrderShippedEvent() {}

    public OrderShippedEvent(String orderId, String trackingNumber) {
        this.orderId = orderId;
        this.trackingNumber = trackingNumber;
    }
}
