package com.example.orders.event;

import java.math.BigDecimal;

public class ItemAddedEvent extends Event {
    public String orderId;
    public String productId;
    public int quantity;
    public BigDecimal price;

    public ItemAddedEvent() {}
    public ItemAddedEvent(String orderId, String productId, int quantity, BigDecimal price) {
        super(orderId);
        this.orderId = orderId;
        this.productId = productId;
        this.quantity = quantity;
        this.price = price;
    }
}
