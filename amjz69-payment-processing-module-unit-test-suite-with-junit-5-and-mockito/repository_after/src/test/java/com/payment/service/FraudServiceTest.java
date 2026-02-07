package com.payment.service;

import com.payment.model.Card;
import com.payment.service.FraudService.FraudCheckResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class FraudServiceTest {

    private FraudService fraudService;
    private Card validCard;

    @BeforeEach
    void setUp() {
        fraudService = new FraudService();
        validCard = new Card("4242424242424242", "John Doe", YearMonth.now().plusYears(1), "123");
    }

    @Test
    void checkTransaction_shouldApprove_whenRiskScoreIsLow() {
        FraudCheckResult result = fraudService.checkTransaction(validCard, new BigDecimal("100.00"), "127.0.0.1", "US");
        
        assertThat(result.approved()).isTrue();
        assertThat(result.riskScore()).isEqualTo(0);
        assertThat(result.reasons()).isEmpty();
    }

    @Test
    void checkTransaction_shouldReject_whenCardIsBlocked() {
        fraudService.blockCard(validCard.getNumber());
        
        FraudCheckResult result = fraudService.checkTransaction(validCard, new BigDecimal("100.00"), "127.0.0.1", "US");
        
        assertThat(result.approved()).isFalse();
        assertThat(result.riskScore()).isEqualTo(100);
        assertThat(result.reasons()).contains("Card is blocked");
    }

    @Test
    void checkTransaction_shouldReject_whenCountryIsBlocked() {
        fraudService.blockCountry("NK");
        
        FraudCheckResult result = fraudService.checkTransaction(validCard, new BigDecimal("100.00"), "127.0.0.1", "NK");
        
        assertThat(result.approved()).isFalse();
        assertThat(result.riskScore()).isEqualTo(100);
        assertThat(result.reasons()).contains("Transactions from this country are blocked");
    }

    @Test
    void checkTransaction_shouldIncreaseRisk_forHighValueTransactions() {
        BigDecimal highAmount = new BigDecimal("6000.00");
        
        FraudCheckResult result = fraudService.checkTransaction(validCard, highAmount, "127.0.0.1", "US");
        
        assertThat(result.approved()).isTrue(); // 30 < 70
        assertThat(result.riskScore()).isEqualTo(30);
        assertThat(result.reasons()).contains("High value transaction");
    }
    
    @Test
    void checkTransaction_shouldIncreaseRisk_forVelocityViolations() {
        // Trigger velocity limit
        for (int i = 0; i < 5; i++) {
            fraudService.checkTransaction(validCard, new BigDecimal("10.00"), "127.0.0.1", "US");
        }
        
        FraudCheckResult result = fraudService.checkTransaction(validCard, new BigDecimal("10.00"), "127.0.0.1", "US");
        
        // 40 points for velocity
        assertThat(result.riskScore()).isGreaterThanOrEqualTo(40);
        assertThat(result.reasons()).contains("Too many transactions in short period");
    }

    @Test
    void checkTransaction_shouldReject_whenMultipleRiskFactorsCombine() {
        // High amount (30) + Velocity (40) = 70 (Not Approved)
        
        // Fill up velocity budget
        for (int i = 0; i < 5; i++) {
            fraudService.checkTransaction(validCard, new BigDecimal("10.00"), "127.0.0.1", "US");
        }
        
        BigDecimal highAmount = new BigDecimal("6000.00");
        FraudCheckResult result = fraudService.checkTransaction(validCard, highAmount, "127.0.0.1", "US");
        
        assertThat(result.approved()).isFalse();
        assertThat(result.riskScore()).isGreaterThanOrEqualTo(70);
        assertThat(result.reasons()).contains("High value transaction", "Too many transactions in short period");
    }
}
