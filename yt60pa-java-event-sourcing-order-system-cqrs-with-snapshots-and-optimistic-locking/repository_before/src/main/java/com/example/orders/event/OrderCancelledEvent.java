package com.example.orders.event;

public class OrderCancelledEvent {
    public String orderId;
    public String reason;

    public OrderCancelledEvent() {}

    public OrderCancelledEvent(String orderId, String reason) {
        this.orderId = orderId;
        this.reason = reason;
    }
}
