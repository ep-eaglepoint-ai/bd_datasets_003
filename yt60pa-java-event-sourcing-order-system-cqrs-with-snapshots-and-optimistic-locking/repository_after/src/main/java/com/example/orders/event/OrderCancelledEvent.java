package com.example.orders.event;

public class OrderCancelledEvent extends Event {
    public String orderId;
    public String reason;

    public OrderCancelledEvent() {}
    public OrderCancelledEvent(String orderId, String reason) {
        super(orderId);
        this.orderId = orderId;
        this.reason = reason;
    }
}
