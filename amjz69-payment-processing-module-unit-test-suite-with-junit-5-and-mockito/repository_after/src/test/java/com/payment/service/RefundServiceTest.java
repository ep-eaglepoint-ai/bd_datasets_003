package com.payment.service;

import com.payment.gateway.PaymentGateway;
import com.payment.gateway.PaymentGateway.GatewayResponse;
import com.payment.model.Transaction;
import com.payment.model.Transaction.TransactionStatus;
import com.payment.model.Transaction.TransactionType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RefundServiceTest {

    @Mock
    private PaymentGateway paymentGateway;

    @Mock
    private PaymentService paymentService;

    private RefundService refundService;

    @BeforeEach
    void setUp() {
        refundService = new RefundService(paymentGateway, paymentService);
    }

    @Test
    void refund_shouldSucceed_whenTransactionIsCapturedAndAmountIsValid() {
        Transaction capturedTxn = new Transaction(new BigDecimal("100.00"), "USD", TransactionType.PAYMENT);
        capturedTxn.setStatus(TransactionStatus.CAPTURED);
        capturedTxn.setGatewayTransactionId("original_txn_id");

        when(paymentService.getTransaction("txn_1")).thenReturn(Optional.of(capturedTxn));
        when(paymentGateway.refund(eq("original_txn_id"), any()))
                .thenReturn(new GatewayResponse(true, "refund_txn_id", null, null));

        BigDecimal refundAmount = new BigDecimal("50.00");
        Transaction refundTxn = refundService.refund("txn_1", refundAmount);

        assertThat(refundTxn.getStatus()).isEqualTo(TransactionStatus.REFUNDED);
        assertThat(refundTxn.getGatewayTransactionId()).isEqualTo("refund_txn_id");
        assertThat(refundTxn.getAmount()).isEqualTo(refundAmount);

        ArgumentCaptor<String> idCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<BigDecimal> amountCaptor = ArgumentCaptor.forClass(BigDecimal.class);
        verify(paymentGateway).refund(idCaptor.capture(), amountCaptor.capture());

        assertThat(idCaptor.getValue()).isEqualTo("original_txn_id");
        assertThat(amountCaptor.getValue()).isEqualTo(refundAmount);
    }

    @Test
    void refund_shouldFail_whenTransactionNotFound() {
        when(paymentService.getTransaction("txn_1")).thenReturn(Optional.empty());
        
        assertThatThrownBy(() -> refundService.refund("txn_1", BigDecimal.TEN))
            .isInstanceOf(RefundService.RefundException.class)
            .hasMessage("Original transaction not found");
    }

    @Test
    void refund_shouldFail_whenTransactionNotCaptured() {
        Transaction pendingTxn = new Transaction(new BigDecimal("100.00"), "USD", TransactionType.PAYMENT);
        pendingTxn.setStatus(TransactionStatus.PENDING);

        when(paymentService.getTransaction("txn_1")).thenReturn(Optional.of(pendingTxn));

        assertThatThrownBy(() -> refundService.refund("txn_1", BigDecimal.TEN))
                .isInstanceOf(RefundService.RefundException.class)
                .hasMessage("Only captured transactions can be refunded");
    }

    @Test
    void refund_shouldFail_whenAmountExceedsRemainingBalance() {
        Transaction capturedTxn = new Transaction(new BigDecimal("100.00"), "USD", TransactionType.PAYMENT);
        capturedTxn.setStatus(TransactionStatus.CAPTURED);

        when(paymentService.getTransaction("txn_1")).thenReturn(Optional.of(capturedTxn));

        assertThatThrownBy(() -> refundService.refund("txn_1", new BigDecimal("101.00")))
                .isInstanceOf(RefundService.RefundException.class)
                .hasMessageContaining("Refund amount exceeds remaining balance");
    }

    @Test
    void refund_shouldUpdateOriginalStatus_whenFullyRefunded() {
        Transaction capturedTxn = new Transaction(new BigDecimal("100.00"), "USD", TransactionType.PAYMENT);
        capturedTxn.setStatus(TransactionStatus.CAPTURED);
        capturedTxn.setGatewayTransactionId("original_txn_id");

        when(paymentService.getTransaction("txn_1")).thenReturn(Optional.of(capturedTxn));
        when(paymentGateway.refund(anyString(), any()))
                .thenReturn(new GatewayResponse(true, "refund_id", null, null));

        refundService.refund("txn_1", new BigDecimal("100.00"));

        assertThat(capturedTxn.getStatus()).isEqualTo(TransactionStatus.REFUNDED);
    }

    @Test
    void refund_shouldTrackPartialRefundsCorrectly() {
        Transaction capturedTxn = new Transaction(new BigDecimal("100.00"), "USD", TransactionType.PAYMENT);
        capturedTxn.setStatus(TransactionStatus.CAPTURED);
        capturedTxn.setGatewayTransactionId("original_txn_id");

        when(paymentService.getTransaction("txn_1")).thenReturn(Optional.of(capturedTxn));
        when(paymentGateway.refund(anyString(), any()))
                .thenReturn(new GatewayResponse(true, "refund_id", null, null));

        refundService.refund("txn_1", new BigDecimal("30.00"));
        refundService.refund("txn_1", new BigDecimal("30.00"));

        BigDecimal totalRefunded = refundService.getTotalRefunded("txn_1");
        assertThat(totalRefunded).isEqualTo(new BigDecimal("60.00"));

        // Try to refund more than remaining 40
        assertThatThrownBy(() -> refundService.refund("txn_1", new BigDecimal("41.00")))
                .isInstanceOf(RefundService.RefundException.class);
    }

    @Test
    void refund_shouldCallGatewayWithCorrectArguments() {
        Transaction capturedTxn = new Transaction(new BigDecimal("100.00"), "USD", TransactionType.PAYMENT);

        capturedTxn.setStatus(TransactionStatus.CAPTURED);
        capturedTxn.setGatewayTransactionId("original_txn_id");

        when(paymentService.getTransaction("txn_1"))
                .thenReturn(Optional.of(capturedTxn));

        when(paymentGateway.refund(anyString(), any()))
                .thenReturn(new GatewayResponse(true, "refund_id", null, null));

        refundService.refund("txn_1", new BigDecimal("25.00"));

        ArgumentCaptor<String> idCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<BigDecimal> amountCaptor = ArgumentCaptor.forClass(BigDecimal.class);

        verify(paymentGateway).refund(idCaptor.capture(), amountCaptor.capture());

        assertThat(idCaptor.getValue()).isEqualTo("original_txn_id");
        assertThat(amountCaptor.getValue()).isEqualTo(new BigDecimal("25.00"));
    }

}
