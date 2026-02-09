package com.payment.model;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.Instant;
import static org.assertj.core.api.Assertions.assertThat;

class TransactionTest {

    private BigDecimal defaultAmount;
    private String defaultCurrency;

    @BeforeEach
    void setUp() {
        defaultAmount = BigDecimal.TEN;
        defaultCurrency = "USD";
    }

    @Test
    void constructor_shouldSetInitialState() {
        Transaction txn = new Transaction(defaultAmount, defaultCurrency, Transaction.TransactionType.PAYMENT);
        assertThat(txn.getId()).isNotNull();
        assertThat(txn.getStatus()).isEqualTo(Transaction.TransactionStatus.PENDING);
        assertThat(txn.getCreatedAt()).isNotNull();
        assertThat(txn.getUpdatedAt()).isNotNull();
    }

    @Test
    void setStatus_shouldUpdateTimestamp() throws InterruptedException {
        Transaction txn = new Transaction(BigDecimal.TEN, "USD", Transaction.TransactionType.PAYMENT);
        Instant firstUpdate = txn.getUpdatedAt();

        Thread.sleep(10);
        txn.setStatus(Transaction.TransactionStatus.AUTHORIZED);

        assertThat(txn.getUpdatedAt()).isAfter(firstUpdate);
    }
}
