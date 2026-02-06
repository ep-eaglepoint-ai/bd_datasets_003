package com.example.orders.event;

import java.math.BigDecimal;

public class PaymentReceivedEvent {
    public String orderId;
    public BigDecimal amount;
    public String transactionId;

    public PaymentReceivedEvent() {}

    public PaymentReceivedEvent(String orderId, BigDecimal amount, String transactionId) {
        this.orderId = orderId;
        this.amount = amount;
        this.transactionId = transactionId;
    }
}
