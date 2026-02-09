package com.payment.gateway;

import com.payment.model.Card;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StripeGatewayTest {

    private StripeGateway stripeGateway;
    private Card testCard;

    @BeforeEach
    void setUp() {
        stripeGateway = new StripeGateway("test_api_key");
        testCard = new Card("4242424242424242", "Tester", YearMonth.now().plusYears(1), "123");
    }

    @Test
    void authorize_shouldThrowUnsupportedOperationException() {
        assertThatThrownBy(() -> stripeGateway.authorize(testCard, BigDecimal.TEN, "USD", "key"))
                .isInstanceOf(UnsupportedOperationException.class)
                .hasMessage("Real Stripe integration not implemented");
    }

    @Test
    void capture_shouldThrowUnsupportedOperationException() {
        assertThatThrownBy(() -> stripeGateway.capture("id", BigDecimal.TEN))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void voidAuthorization_shouldThrowUnsupportedOperationException() {
        assertThatThrownBy(() -> stripeGateway.voidAuthorization("id"))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void refund_shouldThrowUnsupportedOperationException() {
        assertThatThrownBy(() -> stripeGateway.refund("id", BigDecimal.TEN))
                .isInstanceOf(UnsupportedOperationException.class);
    }
}
