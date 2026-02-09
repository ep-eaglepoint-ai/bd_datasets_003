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
        // BUG: Returns success even though it should be a placeholder or fail
        return new GatewayResponse(true, "fake_id", null, null);
    }

    @Override
    public GatewayResponse capture(String authorizationId, BigDecimal amount) {
        // BUG: Always returns null
        return null;
    }

    @Override
    public GatewayResponse voidAuthorization(String authorizationId) {
        // BUG: Throws wrong exception type
        throw new RuntimeException("Unexpected error");
    }

    @Override
    public GatewayResponse refund(String transactionId, BigDecimal amount) {
        // BUG: Returns failure for everything
        return new GatewayResponse(false, null, "ERR", "Broken");
    }
}
