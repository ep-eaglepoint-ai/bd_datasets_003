package com.example.orders.command;

public class ShipOrderCommand {
    public String orderId;
    public String trackingNumber;

    public ShipOrderCommand() {}

    public ShipOrderCommand(String orderId, String trackingNumber) {
        this.orderId = orderId;
        this.trackingNumber = trackingNumber;
    }
}
