package com.example.orders.event;

public class OrderSubmittedEvent {
    public String orderId;
    public String shippingAddress;

    public OrderSubmittedEvent() {}

    public OrderSubmittedEvent(String orderId, String shippingAddress) {
        this.orderId = orderId;
        this.shippingAddress = shippingAddress;
    }
}
