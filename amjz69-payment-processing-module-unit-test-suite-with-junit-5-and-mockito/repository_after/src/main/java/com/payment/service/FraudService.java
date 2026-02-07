package com.payment.service;

import com.payment.model.Card;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class FraudService {
    private final Map<String, List<FraudCheck>> recentTransactions;
    private final Set<String> blockedCards;
    private final Set<String> blockedCountries;

    private static final BigDecimal HIGH_RISK_THRESHOLD = new BigDecimal("5000.00");
    private static final int MAX_TRANSACTIONS_PER_HOUR = 10;
    private static final int MAX_TRANSACTIONS_PER_CARD_PER_HOUR = 5;

    public FraudService() {
        this.recentTransactions = new ConcurrentHashMap<>();
        this.blockedCards = ConcurrentHashMap.newKeySet();
        this.blockedCountries = ConcurrentHashMap.newKeySet();
    }

    public FraudCheckResult checkTransaction(Card card, BigDecimal amount, String ipAddress, String country) {
        List<String> reasons = new ArrayList<>();
        int riskScore = 0;

        if (isCardBlocked(card.getNumber())) {
            return new FraudCheckResult(false, 100, List.of("Card is blocked"));
        }

        if (isCountryBlocked(country)) {
            return new FraudCheckResult(false, 100, List.of("Transactions from this country are blocked"));
        }

        if (amount.compareTo(HIGH_RISK_THRESHOLD) > 0) {
            riskScore += 30;
            reasons.add("High value transaction");
        }

        if (exceedsVelocityLimit(card.getNumber())) {
            riskScore += 40;
            reasons.add("Too many transactions in short period");
        }

        if (exceedsIpVelocityLimit(ipAddress)) {
            riskScore += 25;
            reasons.add("Too many transactions from this IP");
        }

        if (isUnusualAmount(card.getNumber(), amount)) {
            riskScore += 20;
            reasons.add("Unusual transaction amount");
        }

        recordTransaction(card.getNumber(), ipAddress, amount);

        boolean approved = riskScore < 70;
        return new FraudCheckResult(approved, riskScore, reasons);
    }

    public void blockCard(String cardNumber) {
        blockedCards.add(maskCardNumber(cardNumber));
    }

    public void unblockCard(String cardNumber) {
        blockedCards.remove(maskCardNumber(cardNumber));
    }

    public boolean isCardBlocked(String cardNumber) {
        return blockedCards.contains(maskCardNumber(cardNumber));
    }

    public void blockCountry(String countryCode) {
        blockedCountries.add(countryCode.toUpperCase());
    }

    public void unblockCountry(String countryCode) {
        blockedCountries.remove(countryCode.toUpperCase());
    }

    public boolean isCountryBlocked(String countryCode) {
        return countryCode != null && blockedCountries.contains(countryCode.toUpperCase());
    }

    private boolean exceedsVelocityLimit(String cardNumber) {
        String key = "card:" + maskCardNumber(cardNumber);
        return countRecentTransactions(key) >= MAX_TRANSACTIONS_PER_CARD_PER_HOUR;
    }

    private boolean exceedsIpVelocityLimit(String ipAddress) {
        String key = "ip:" + ipAddress;
        return countRecentTransactions(key) >= MAX_TRANSACTIONS_PER_HOUR;
    }

    private int countRecentTransactions(String key) {
        List<FraudCheck> checks = recentTransactions.getOrDefault(key, List.of());
        Instant oneHourAgo = Instant.now().minus(Duration.ofHours(1));
        return (int) checks.stream()
            .filter(c -> c.timestamp.isAfter(oneHourAgo))
            .count();
    }

    private boolean isUnusualAmount(String cardNumber, BigDecimal amount) {
        String key = "card:" + maskCardNumber(cardNumber);
        List<FraudCheck> history = recentTransactions.getOrDefault(key, List.of());
        
        if (history.size() < 3) return false;

        BigDecimal avgAmount = history.stream()
            .map(c -> c.amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add)
            .divide(BigDecimal.valueOf(history.size()), 2, java.math.RoundingMode.HALF_UP);

        BigDecimal threshold = avgAmount.multiply(BigDecimal.valueOf(3));
        return amount.compareTo(threshold) > 0;
    }

    private void recordTransaction(String cardNumber, String ipAddress, BigDecimal amount) {
        FraudCheck check = new FraudCheck(Instant.now(), amount);
        
        recentTransactions.computeIfAbsent("card:" + maskCardNumber(cardNumber), k -> new ArrayList<>())
            .add(check);
        recentTransactions.computeIfAbsent("ip:" + ipAddress, k -> new ArrayList<>())
            .add(check);
    }

    private String maskCardNumber(String number) {
        if (number == null || number.length() < 10) return number;
        return number.substring(0, 6) + "****" + number.substring(number.length() - 4);
    }

    public record FraudCheckResult(boolean approved, int riskScore, List<String> reasons) {}
    private record FraudCheck(Instant timestamp, BigDecimal amount) {}
}
