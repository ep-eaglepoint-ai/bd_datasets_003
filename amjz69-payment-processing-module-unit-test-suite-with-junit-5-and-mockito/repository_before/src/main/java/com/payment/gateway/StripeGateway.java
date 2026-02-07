package com.payment.gateway;

import com.payment.model.Card;
import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.time.Duration;

public class StripeGateway implements PaymentGateway {
    private final HttpClient httpClient;
    private final String apiKey;
    private final String baseUrl;

    public StripeGateway(String apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = "https://api.stripe.com/v1";
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    }

    public StripeGateway(String apiKey, String baseUrl, HttpClient httpClient) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.httpClient = httpClient;
    }

    @Override
    public GatewayResponse authorize(Card card, BigDecimal amount, String currency, String idempotencyKey) {
        throw new UnsupportedOperationException("Real Stripe integration not implemented");
    }

    @Override
    public GatewayResponse capture(String authorizationId, BigDecimal amount) {
        throw new UnsupportedOperationException("Real Stripe integration not implemented");
    }

    @Override
    public GatewayResponse voidAuthorization(String authorizationId) {
        throw new UnsupportedOperationException("Real Stripe integration not implemented");
    }

    @Override
    public GatewayResponse refund(String transactionId, BigDecimal amount) {
        throw new UnsupportedOperationException("Real Stripe integration not implemented");
    }
}
