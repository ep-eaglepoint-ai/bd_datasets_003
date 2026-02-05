package com.payment.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class BankClient {

    @Value("${bank.api.url}")
    private String bankApiUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    public String processPayment(BigDecimal amount, String currency) {
        Map<String, Object> request = new HashMap<>();
        request.put("amount", amount);
        request.put("currency", currency);
        request.put("reference", UUID.randomUUID().toString());

        Map<String, Object> response = restTemplate.postForObject(
            bankApiUrl + "/process",
            request,
            Map.class
        );

        return (String) response.get("transactionId");
    }

    public boolean refundPayment(String transactionId, BigDecimal amount) {
        Map<String, Object> request = new HashMap<>();
        request.put("transactionId", transactionId);
        request.put("amount", amount);

        Map<String, Object> response = restTemplate.postForObject(
            bankApiUrl + "/refund",
            request,
            Map.class
        );

        return (Boolean) response.get("success");
    }
}
