package com.example.orders.event;

public class ItemRemovedEvent {
    public String orderId;
    public String productId;

    public ItemRemovedEvent() {}

    public ItemRemovedEvent(String orderId, String productId) {
        this.orderId = orderId;
        this.productId = productId;
    }
}
