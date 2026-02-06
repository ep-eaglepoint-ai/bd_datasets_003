package com.example.orders.command;

public class CreateOrderCommand {
    public String orderId;
    public String customerId;

    public CreateOrderCommand() {}

    public CreateOrderCommand(String orderId, String customerId) {
        this.orderId = orderId;
        this.customerId = customerId;
    }
}
