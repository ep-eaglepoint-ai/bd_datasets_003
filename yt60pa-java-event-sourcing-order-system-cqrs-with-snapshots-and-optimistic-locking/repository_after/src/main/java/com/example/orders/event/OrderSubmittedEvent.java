package com.example.orders.event;

public class OrderSubmittedEvent extends Event {
    public String orderId;
    public String shippingAddress;

    public OrderSubmittedEvent() {}
    public OrderSubmittedEvent(String orderId, String shippingAddress) {
        super(orderId);
        this.orderId = orderId;
        this.shippingAddress = shippingAddress;
    }
}
