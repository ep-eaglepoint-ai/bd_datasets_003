package com.payment.validation;

import com.payment.model.Card;
import java.time.Clock;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

public class CardValidator {
    private final Clock clock;

    public CardValidator() {
        this.clock = Clock.systemUTC();
    }

    public CardValidator(Clock clock) {
        this.clock = clock;
    }

    public ValidationResult validate(Card card) {
        List<String> errors = new ArrayList<>();

        if (card == null) {
            return new ValidationResult(false, List.of("Card cannot be null"));
        }

        if (!isValidLuhn(card.getNumber())) {
            errors.add("Invalid card number");
        }

        if (!isValidExpiry(card.getExpiry())) {
            errors.add("Card has expired");
        }

        if (!isValidCvv(card.getCvv(), card.getType())) {
            errors.add("Invalid CVV");
        }

        if (card.getHolderName() == null || card.getHolderName().trim().isEmpty()) {
            errors.add("Cardholder name is required");
        }

        return new ValidationResult(errors.isEmpty(), errors);
    }

    public boolean isValidLuhn(String number) {
        if (number == null || number.isEmpty()) return false;
        
        String digits = number.replaceAll("\\s", "");
        if (!digits.matches("\\d+") || digits.length() < 13 || digits.length() > 19) {
            return false;
        }

        int sum = 0;
        boolean alternate = false;
        
        for (int i = digits.length() - 1; i >= 0; i--) {
            int digit = Character.getNumericValue(digits.charAt(i));
            
            if (alternate) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            
            sum += digit;
            alternate = !alternate;
        }
        
        return sum % 10 == 0;
    }

    public boolean isValidExpiry(YearMonth expiry) {
        if (expiry == null) return false;
        YearMonth now = YearMonth.now(clock);
        return !expiry.isBefore(now);
    }

    public boolean isValidCvv(String cvv, Card.CardType cardType) {
        if (cvv == null || !cvv.matches("\\d+")) return false;
        
        if (cardType == Card.CardType.AMEX) {
            return cvv.length() == 4;
        }
        return cvv.length() == 3;
    }

    public record ValidationResult(boolean valid, List<String> errors) {}
}
