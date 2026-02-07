package com.payment.gateway;

import com.payment.model.Card;
import java.math.BigDecimal;

public interface PaymentGateway {
    GatewayResponse authorize(Card card, BigDecimal amount, String currency, String idempotencyKey);
    GatewayResponse capture(String authorizationId, BigDecimal amount);
    GatewayResponse voidAuthorization(String authorizationId);
    GatewayResponse refund(String transactionId, BigDecimal amount);
    
    record GatewayResponse(
        boolean success,
        String transactionId,
        String errorCode,
        String errorMessage
    ) {}
}
