package com.example.orders.command;

public class RemoveItemCommand {
    public String orderId;
    public String productId;

    public RemoveItemCommand() {}

    public RemoveItemCommand(String orderId, String productId) {
        this.orderId = orderId;
        this.productId = productId;
    }
}
