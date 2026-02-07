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
        if (idempotencyKey != null && idempotencyCache.containsKey(idempotencyKey)) {
            return idempotencyCache.get(idempotencyKey);
        }

        validateAmount(amount);
        
        ValidationResult validationResult = cardValidator.validate(card);
        if (!validationResult.valid()) {
            throw new PaymentException("Card validation failed: " + 
                String.join(", ", validationResult.errors()));
        }

        Transaction transaction = new Transaction(amount, currency, TransactionType.PAYMENT);
        transaction.setCardLast4(card.getNumber().substring(card.getNumber().length() - 4));
        transaction.setIdempotencyKey(idempotencyKey);

        GatewayResponse response = gateway.authorize(card, amount, currency, idempotencyKey);
        
        if (response.success()) {
            transaction.setStatus(TransactionStatus.AUTHORIZED);
            transaction.setGatewayTransactionId(response.transactionId());
        } else {
            transaction.setStatus(TransactionStatus.FAILED);
            transaction.setFailureReason(response.errorMessage());
        }

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

        if (amount != null && amount.compareTo(transaction.getAmount()) > 0) {
            throw new PaymentException("Capture amount cannot exceed authorized amount");
        }

        BigDecimal captureAmount = amount != null ? amount : transaction.getAmount();
        
        GatewayResponse response = gateway.capture(transaction.getGatewayTransactionId(), captureAmount);
        
        if (response.success()) {
            transaction.setStatus(TransactionStatus.CAPTURED);
        } else {
            transaction.setFailureReason(response.errorMessage());
        }

        return transaction;
    }

    public Transaction voidTransaction(String transactionId) {
        Transaction transaction = getTransaction(transactionId)
            .orElseThrow(() -> new PaymentException("Transaction not found: " + transactionId));

        if (transaction.getStatus() != TransactionStatus.AUTHORIZED) {
            throw new PaymentException("Only authorized transactions can be voided");
        }

        GatewayResponse response = gateway.voidAuthorization(transaction.getGatewayTransactionId());
        
        if (response.success()) {
            transaction.setStatus(TransactionStatus.VOIDED);
        } else {
            transaction.setFailureReason(response.errorMessage());
        }

        return transaction;
    }

    public Optional<Transaction> getTransaction(String transactionId) {
        return Optional.ofNullable(transactions.get(transactionId));
    }

    private void validateAmount(BigDecimal amount) {
        if (amount == null) {
            throw new PaymentException("Amount is required");
        }
        if (amount.compareTo(MIN_AMOUNT) < 0) {
            throw new PaymentException("Amount must be at least " + MIN_AMOUNT);
        }
        if (amount.compareTo(MAX_AMOUNT) > 0) {
            throw new PaymentException("Amount cannot exceed " + MAX_AMOUNT);
        }
    }

    public static class PaymentException extends RuntimeException {
        public PaymentException(String message) {
            super(message);
        }
    }
}
