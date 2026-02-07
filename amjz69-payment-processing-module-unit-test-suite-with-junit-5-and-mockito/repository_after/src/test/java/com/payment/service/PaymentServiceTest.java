package com.payment.service;

import com.payment.gateway.PaymentGateway;
import com.payment.gateway.PaymentGateway.GatewayResponse;
import com.payment.model.Card;
import com.payment.model.Transaction;
import com.payment.model.Transaction.TransactionStatus;
import com.payment.validation.CardValidator;
import com.payment.validation.CardValidator.ValidationResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    @Mock
    private PaymentGateway paymentGateway;

    @Mock
    private CardValidator cardValidator;

    private PaymentService paymentService;

    private Card validCard;

    @BeforeEach
    void setUp() {
        paymentService = new PaymentService(paymentGateway, cardValidator);
        validCard = new Card("4242424242424242", "John Doe", YearMonth.now().plusYears(1), "123");
    }

    @Test
    void authorize_shouldSucceed_whenCardIsValidAndGatewayApproves() {
        BigDecimal amount = new BigDecimal("100.00");
        String currency = "USD";
        String idempotencyKey = UUID.randomUUID().toString();

        when(cardValidator.validate(validCard)).thenReturn(new ValidationResult(true, List.of()));
        when(paymentGateway.authorize(any(), any(), any(), any()))
                .thenReturn(new GatewayResponse(true, "txn_123", null, null));

        Transaction transaction = paymentService.authorize(validCard, amount, currency, idempotencyKey);

        assertThat(transaction.getStatus()).isEqualTo(TransactionStatus.AUTHORIZED);
        assertThat(transaction.getGatewayTransactionId()).isEqualTo("txn_123");

        ArgumentCaptor<BigDecimal> amountCaptor = ArgumentCaptor.forClass(BigDecimal.class);
        ArgumentCaptor<String> currencyCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);

        verify(paymentGateway).authorize(eq(validCard), amountCaptor.capture(), currencyCaptor.capture(),
                keyCaptor.capture());

        assertThat(amountCaptor.getValue()).isEqualTo(amount);
        assertThat(currencyCaptor.getValue()).isEqualTo(currency);
        assertThat(keyCaptor.getValue()).isEqualTo(idempotencyKey);
    }

    @Test
    void authorize_shouldFail_whenCardIsInvalid() {
        when(cardValidator.validate(validCard)).thenReturn(new ValidationResult(false, List.of("Invalid card")));
        
        assertThatThrownBy(() -> paymentService.authorize(validCard, new BigDecimal("100.00"), "USD", null))
            .isInstanceOf(PaymentService.PaymentException.class)
            .hasMessageContaining("Card validation failed");
            
        verifyNoInteractions(paymentGateway);
    }

    @Test
    void authorize_shouldFail_whenGatewayRejects() {
        BigDecimal amount = new BigDecimal("100.00");
        when(cardValidator.validate(validCard)).thenReturn(new ValidationResult(true, List.of()));
        when(paymentGateway.authorize(any(), any(), any(), any()))
                .thenReturn(new GatewayResponse(false, null, "ERR_01", "Insufficient funds"));

        Transaction transaction = paymentService.authorize(validCard, amount, "USD", null);

        assertThat(transaction.getStatus()).isEqualTo(TransactionStatus.FAILED);
        assertThat(transaction.getFailureReason()).isEqualTo("Insufficient funds");
    }

    @Test
    void authorize_shouldReturnCachedTransaction_whenIdempotencyKeyIsReused() {
        String key = "unique_key_123";
        BigDecimal amount = new BigDecimal("50.00");

        when(cardValidator.validate(validCard)).thenReturn(new ValidationResult(true, List.of()));
        when(paymentGateway.authorize(any(), any(), any(), any()))
                .thenReturn(new GatewayResponse(true, "txn_123", null, null));

        Transaction firstTxn = paymentService.authorize(validCard, amount, "USD", key);
        Transaction secondTxn = paymentService.authorize(validCard, amount, "USD", key);

        assertThat(firstTxn).isSameAs(secondTxn);
        verify(paymentGateway, times(1)).authorize(any(), any(), any(), any());
    }

    @Test
    void authorize_shouldThrowException_whenAmountIsInvalid() {
        assertThatThrownBy(() -> paymentService.authorize(validCard, null, "USD", null))
                .isInstanceOf(PaymentService.PaymentException.class)
                .hasMessage("Amount is required");

        assertThatThrownBy(() -> paymentService.authorize(validCard, new BigDecimal("0.10"), "USD", null))
                .isInstanceOf(PaymentService.PaymentException.class)
                .hasMessageContaining("Amount must be at least");

        assertThatThrownBy(() -> paymentService.authorize(validCard, new BigDecimal("1000000.00"), "USD", null))
                .isInstanceOf(PaymentService.PaymentException.class)
                .hasMessageContaining("Amount cannot exceed");
    }

    @Test
    void capture_shouldSucceed_whenAuthorized() {
        Transaction authorizedTxn = createAuthorizedTransaction();

        when(paymentGateway.capture(anyString(), any()))
                .thenReturn(new GatewayResponse(true, "capture_123", null, null));

        Transaction capturedTxn = paymentService.capture(authorizedTxn.getId(), null);

        assertThat(capturedTxn.getStatus()).isEqualTo(TransactionStatus.CAPTURED);

        ArgumentCaptor<String> idCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<BigDecimal> amountCaptor = ArgumentCaptor.forClass(BigDecimal.class);
        verify(paymentGateway).capture(idCaptor.capture(), amountCaptor.capture());

        assertThat(idCaptor.getValue()).isEqualTo(authorizedTxn.getGatewayTransactionId());
        assertThat(amountCaptor.getValue()).isEqualTo(authorizedTxn.getAmount());
    }

@Test
void capture_shouldFail_whenTransactionIsFailed() {
    when(cardValidator.validate(any()))
        .thenReturn(new ValidationResult(true, List.of()));

    when(paymentGateway.authorize(any(), any(), any(), any()))
        .thenReturn(new GatewayResponse(false, null, "ERR", "failure"));

    Transaction failedTxn =
        paymentService.authorize(validCard, BigDecimal.TEN, "USD", null);

    assertThatThrownBy(() ->
        paymentService.capture(failedTxn.getId(), null)
    )
    .isInstanceOf(PaymentService.PaymentException.class)
    .hasMessageContaining("cannot be captured");
}

    @Test
    void capture_shouldFail_whenAmountExceedsAuthorized() {
        Transaction authorizedTxn = createAuthorizedTransaction();

        assertThatThrownBy(
                () -> paymentService.capture(authorizedTxn.getId(), authorizedTxn.getAmount().add(BigDecimal.ONE)))
                .isInstanceOf(PaymentService.PaymentException.class)
                .hasMessage("Capture amount cannot exceed authorized amount");
    }

    @Test
    void void_shouldSucceed_whenAuthorized() {
        Transaction authorizedTxn = createAuthorizedTransaction();

        when(paymentGateway.voidAuthorization(anyString()))
                .thenReturn(new GatewayResponse(true, "void_123", null, null));

        Transaction voidedTxn = paymentService.voidTransaction(authorizedTxn.getId());

        assertThat(voidedTxn.getStatus()).isEqualTo(TransactionStatus.VOIDED);

        ArgumentCaptor<String> idCaptor = ArgumentCaptor.forClass(String.class);
        verify(paymentGateway).voidAuthorization(idCaptor.capture());
        assertThat(idCaptor.getValue()).isEqualTo(authorizedTxn.getGatewayTransactionId());
    }

    // Helper to create an authorized transaction in the service
    private Transaction createAuthorizedTransaction() {
        when(cardValidator.validate(any())).thenReturn(new ValidationResult(true, List.of()));
        when(paymentGateway.authorize(any(), any(), any(), any()))
            .thenReturn(new GatewayResponse(true, "gateway_id", null, null));
        return paymentService.authorize(validCard, new BigDecimal("100.00"), "USD", UUID.randomUUID().toString());
    }
}
