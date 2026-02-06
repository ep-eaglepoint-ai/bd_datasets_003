package com.example.orders.command;

public class SubmitOrderCommand {
    public String orderId;
    public String shippingAddress;

    public SubmitOrderCommand() {}

    public SubmitOrderCommand(String orderId, String shippingAddress) {
        this.orderId = orderId;
        this.shippingAddress = shippingAddress;
    }
}
