package com.example.orders.command;

import java.math.BigDecimal;

public class ReceivePaymentCommand {
    public String orderId;
    public BigDecimal amount;
    public String transactionId;

    public ReceivePaymentCommand() {}

    public ReceivePaymentCommand(String orderId, BigDecimal amount, String transactionId) {
        this.orderId = orderId;
        this.amount = amount;
        this.transactionId = transactionId;
    }
}
