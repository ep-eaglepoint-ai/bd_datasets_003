package com.example.orders.event;

import java.math.BigDecimal;

public class ItemRemovedEvent {
    public String orderId;
    public String productId;
    public int quantity;
    public BigDecimal price;

    public ItemRemovedEvent() {}

    public ItemRemovedEvent(String orderId, String productId, int quantity, BigDecimal price) {
        this.orderId = orderId;
        this.productId = productId;
        this.quantity = quantity;
        this.price = price;
    }
}
