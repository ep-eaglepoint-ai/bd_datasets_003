package com.payment.model;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public class Transaction {
    private String id;
    private BigDecimal amount;
    private String currency;
    private TransactionStatus status;
    private TransactionType type;
    private String cardLast4;
    private String gatewayTransactionId;
    private Instant createdAt;
    private Instant updatedAt;
    private String failureReason;
    private String idempotencyKey;

    public enum TransactionStatus {
        PENDING, AUTHORIZED, CAPTURED, VOIDED, FAILED, REFUNDED
    }

    public enum TransactionType {
        PAYMENT, REFUND, RECURRING
    }

    public Transaction(BigDecimal amount, String currency, TransactionType type) {
        this.id = UUID.randomUUID().toString();
        this.amount = amount;
        this.currency = currency;
        this.type = type;
        // BUG: Starts as AUTHORIZED instead of PENDING
        this.status = TransactionStatus.AUTHORIZED;
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public String getId() {
        return id;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getCurrency() {
        return currency;
    }

    public TransactionStatus getStatus() {
        return status;
    }

    public void setStatus(TransactionStatus status) {
        this.status = status;
        // BUG: Fails to update updatedAt
    }

    public TransactionType getType() {
        return type;
    }

    public String getCardLast4() {
        return cardLast4;
    }

    public void setCardLast4(String cardLast4) {
        this.cardLast4 = cardLast4;
    }

    public String getGatewayTransactionId() {
        return gatewayTransactionId;
    }

    public void setGatewayTransactionId(String gatewayTransactionId) {
        this.gatewayTransactionId = gatewayTransactionId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public String getFailureReason() {
        return failureReason;
    }

    public void setFailureReason(String failureReason) {
        this.failureReason = failureReason;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public void setIdempotencyKey(String idempotencyKey) {
        this.idempotencyKey = idempotencyKey;
    }
}
