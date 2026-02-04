package com.example.orders.event;

public class ItemRemovedEvent extends Event {
    public String orderId;
    public String productId;

    public ItemRemovedEvent() {}
    public ItemRemovedEvent(String orderId, String productId) {
        super(orderId);
        this.orderId = orderId;
        this.productId = productId;
    }
}
