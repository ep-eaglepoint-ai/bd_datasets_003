package com.payment.service;

import com.payment.model.Card;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * BROKEN VERSION for Meta-Testing.
 * BUG: Always returns "approved" and risk score 0.
 */
public class FraudService {
    private final Map<String, List<FraudCheck>> recentTransactions;
    private final Set<String> blockedCards;
    private final Set<String> blockedCountries;

    public FraudService() {
        this.recentTransactions = new ConcurrentHashMap<>();
        this.blockedCards = ConcurrentHashMap.newKeySet();
        this.blockedCountries = ConcurrentHashMap.newKeySet();
    }

    public FraudCheckResult checkTransaction(Card card, BigDecimal amount, String ipAddress, String country) {
        // BUG: All checks are ignored
        return new FraudCheckResult(true, 0, new ArrayList<>());
    }

    public void blockCard(String cardNumber) {
    }

    public void unblockCard(String cardNumber) {
    }

    public boolean isCardBlocked(String cardNumber) {
        return false;
    }

    public void blockCountry(String countryCode) {
    }

    public void unblockCountry(String countryCode) {
    }

    public boolean isCountryBlocked(String countryCode) {
        return false;
    }

    public record FraudCheckResult(boolean approved, int riskScore, List<String> reasons) {
    }

    private record FraudCheck(Instant timestamp, BigDecimal amount) {
    }
}
