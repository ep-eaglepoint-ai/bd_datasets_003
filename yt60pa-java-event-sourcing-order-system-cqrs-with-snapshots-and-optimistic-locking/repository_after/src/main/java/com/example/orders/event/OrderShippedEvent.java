package com.example.orders.event;

public class OrderShippedEvent extends Event {
    public String orderId;
    public String trackingNumber;

    public OrderShippedEvent() {}
    public OrderShippedEvent(String orderId, String trackingNumber) {
        super(orderId);
        this.orderId = orderId;
        this.trackingNumber = trackingNumber;
    }
}
