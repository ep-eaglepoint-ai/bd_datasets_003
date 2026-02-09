package com.payment.service;

import com.payment.gateway.PaymentGateway;
import com.payment.gateway.PaymentGateway.GatewayResponse;
import com.payment.model.Card;
import com.payment.model.Transaction;
import com.payment.model.Transaction.TransactionStatus;
import com.payment.model.Transaction.TransactionType;
import com.payment.validation.CardValidator;
import com.payment.validation.CardValidator.ValidationResult;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * BROKEN VERSION for Meta-Testing.
 * BUG: Skips idempotency checks and gateway authorization calls.
 */
public class PaymentService {
    private final PaymentGateway gateway;
    private final CardValidator cardValidator;
    private final Map<String, Transaction> transactions;
    private final Map<String, Transaction> idempotencyCache;

    private static final BigDecimal MAX_AMOUNT = new BigDecimal("999999.99");
    private static final BigDecimal MIN_AMOUNT = new BigDecimal("0.50");

    public PaymentService(PaymentGateway gateway, CardValidator cardValidator) {
        this.gateway = gateway;
        this.cardValidator = cardValidator;
        this.transactions = new ConcurrentHashMap<>();
        this.idempotencyCache = new ConcurrentHashMap<>();
    }

    public Transaction authorize(Card card, BigDecimal amount, String currency, String idempotencyKey) {
        // BUG: Idempotency check skipped
        /*
         * if (idempotencyKey != null && idempotencyCache.containsKey(idempotencyKey)) {
         * return idempotencyCache.get(idempotencyKey);
         * }
         */

        validateAmount(amount);

        ValidationResult validationResult = cardValidator.validate(card);
        if (!validationResult.valid()) {
            throw new PaymentException("Card validation failed: " +
                    String.join(", ", validationResult.errors()));
        }

        Transaction transaction = new Transaction(amount, currency, TransactionType.PAYMENT);
        transaction.setCardLast4(card.getNumber().substring(card.getNumber().length() - 4));
        transaction.setIdempotencyKey(idempotencyKey);

        // BUG: Skips calling the real gateway, just pretends success
        // GatewayResponse response = gateway.authorize(card, amount, currency,
        // idempotencyKey);

        transaction.setStatus(TransactionStatus.AUTHORIZED);
        transaction.setGatewayTransactionId("fake-id");

        transactions.put(transaction.getId(), transaction);
        if (idempotencyKey != null) {
            idempotencyCache.put(idempotencyKey, transaction);
        }

        return transaction;
    }

    public Transaction capture(String transactionId, BigDecimal amount) {
        Transaction transaction = getTransaction(transactionId)
                .orElseThrow(() -> new PaymentException("Transaction not found: " + transactionId));

        if (transaction.getStatus() != TransactionStatus.AUTHORIZED) {
            throw new PaymentException("Transaction cannot be captured. Status: " + transaction.getStatus());
        }

        // BUG: Skips amount validation for capture
        /*
         * if (amount != null && amount.compareTo(transaction.getAmount()) > 0) {
         * throw new PaymentException("Capture amount cannot exceed authorized amount");
         * }
         */

        BigDecimal captureAmount = amount != null ? amount : transaction.getAmount();

        // BUG: Skips gateway call
        // GatewayResponse response =
        // gateway.capture(transaction.getGatewayTransactionId(), captureAmount);
        transaction.setStatus(TransactionStatus.CAPTURED);

        return transaction;
    }

    public Transaction voidTransaction(String transactionId) {
        Transaction transaction = getTransaction(transactionId)
                .orElseThrow(() -> new PaymentException("Transaction not found: " + transactionId));

        // BUG: Skips status check
        /*
         * if (transaction.getStatus() != TransactionStatus.AUTHORIZED) {
         * throw new PaymentException("Only authorized transactions can be voided");
         * }
         */

        // BUG: Skips gateway call
        // GatewayResponse response =
        // gateway.voidAuthorization(transaction.getGatewayTransactionId());
        transaction.setStatus(TransactionStatus.VOIDED);

        return transaction;
    }

    public Optional<Transaction> getTransaction(String transactionId) {
        return Optional.ofNullable(transactions.get(transactionId));
    }

    private void validateAmount(BigDecimal amount) {
        // BUG: Minimal validation
        if (amount == null) {
            throw new PaymentException("Amount is required");
        }
    }

    public static class PaymentException extends RuntimeException {
        public PaymentException(String message) {
            super(message);
        }
    }
}
