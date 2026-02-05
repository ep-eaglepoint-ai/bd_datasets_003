package com.payment.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

@Component
public class FraudCheckClient {

    @Value("${fraud.api.url}")
    private String fraudApiUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    public boolean checkFraud(Long customerId, BigDecimal amount) {
        Map<String, Object> request = new HashMap<>();
        request.put("customerId", customerId);
        request.put("amount", amount);

        Map<String, Object> response = restTemplate.postForObject(
            fraudApiUrl + "/check",
            request,
            Map.class
        );

        return (Boolean) response.get("isFraudulent");
    }
}
