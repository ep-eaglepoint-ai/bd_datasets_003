package com.example.orders.event;

import java.math.BigDecimal;

public class OrderCreatedEvent extends Event {
    public String orderId;
    public String customerId;

    public OrderCreatedEvent() {}
    public OrderCreatedEvent(String orderId, String customerId) {
        super(orderId);
        this.orderId = orderId;
        this.customerId = customerId;
    }
}
