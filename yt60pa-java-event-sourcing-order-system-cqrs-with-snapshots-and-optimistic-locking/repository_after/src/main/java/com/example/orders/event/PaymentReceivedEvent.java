package com.example.orders.event;

import java.math.BigDecimal;

public class PaymentReceivedEvent extends Event {
    public String orderId;
    public BigDecimal amount;
    public String transactionId;

    public PaymentReceivedEvent() {}
    public PaymentReceivedEvent(String orderId, BigDecimal amount, String transactionId) {
        super(orderId);
        this.orderId = orderId;
        this.amount = amount;
        this.transactionId = transactionId;
    }
}
