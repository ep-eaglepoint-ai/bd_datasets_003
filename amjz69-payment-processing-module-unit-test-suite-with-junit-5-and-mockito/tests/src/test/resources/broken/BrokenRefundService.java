package com.payment.service;

import com.payment.gateway.PaymentGateway;
import com.payment.gateway.PaymentGateway.GatewayResponse;
import com.payment.model.Transaction;
import com.payment.model.Transaction.TransactionStatus;
import com.payment.model.Transaction.TransactionType;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * BROKEN VERSION for Meta-Testing.
 * BUG: Allows over-refunding (ignoring remaining balance).
 */
public class RefundService {
    private final PaymentGateway gateway;
    private final PaymentService paymentService;
    private final Map<String, List<Transaction>> refundsByOriginal;

    public RefundService(PaymentGateway gateway, PaymentService paymentService) {
        this.gateway = gateway;
        this.paymentService = paymentService;
        this.refundsByOriginal = new ConcurrentHashMap<>();
    }

    public Transaction refund(String originalTransactionId, BigDecimal amount) {
        Transaction original = paymentService.getTransaction(originalTransactionId)
                .orElseThrow(() -> new RefundException("Original transaction not found"));

        if (original.getStatus() != TransactionStatus.CAPTURED) {
            throw new RefundException("Only captured transactions can be refunded");
        }

        // BUG: Refund amount check is ignored
        /*
         * BigDecimal totalRefunded = getTotalRefunded(originalTransactionId);
         * BigDecimal maxRefundable = original.getAmount().subtract(totalRefunded);
         * 
         * if (amount.compareTo(maxRefundable) > 0) {
         * throw new
         * RefundException("Refund amount exceeds remaining balance. Max refundable: " +
         * maxRefundable);
         * }
         */

        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new RefundException("Refund amount must be positive");
        }

        Transaction refundTransaction = new Transaction(amount, original.getCurrency(), TransactionType.REFUND);

        // BUG: Skips gateway call
        // GatewayResponse response = gateway.refund(original.getGatewayTransactionId(),
        // amount);

        refundTransaction.setStatus(TransactionStatus.REFUNDED);
        refundTransaction.setGatewayTransactionId("fake-refund-id");

        refundsByOriginal.computeIfAbsent(originalTransactionId, k -> new ArrayList<>())
                .add(refundTransaction);

        return refundTransaction;
    }

    public BigDecimal getTotalRefunded(String originalTransactionId) {
        return refundsByOriginal.getOrDefault(originalTransactionId, List.of())
                .stream()
                .filter(t -> t.getStatus() == TransactionStatus.REFUNDED)
                .map(Transaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public List<Transaction> getRefundsForTransaction(String originalTransactionId) {
        return new ArrayList<>(refundsByOriginal.getOrDefault(originalTransactionId, List.of()));
    }

    public static class RefundException extends RuntimeException {
        public RefundException(String message) {
            super(message);
        }
    }
}
