package com.example.orders.command;

import java.math.BigDecimal;

public class AddItemCommand {
    public String orderId;
    public String productId;
    public int quantity;
    public BigDecimal price;

    public AddItemCommand() {}

    public AddItemCommand(String orderId, String productId, int quantity, BigDecimal price) {
        this.orderId = orderId;
        this.productId = productId;
        this.quantity = quantity;
        this.price = price;
    }
}
