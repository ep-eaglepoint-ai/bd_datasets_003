package com.example.orders.command;

public class CancelOrderCommand {
    public String orderId;
    public String reason;

    public CancelOrderCommand() {}

    public CancelOrderCommand(String orderId, String reason) {
        this.orderId = orderId;
        this.reason = reason;
    }
}
