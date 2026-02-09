package com.payment.validation;

import com.payment.model.Card;
import java.time.Clock;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/**
 * BROKEN VERSION for Meta-Testing.
 * BUG: Skips Luhn validation and expiry check.
 */
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

        // BUG: Luhn check is ignored
        /*
         * if (!isValidLuhn(card.getNumber())) {
         * errors.add("Invalid card number");
         * }
         */

        // BUG: Expiry check is ignored
        /*
         * if (!isValidExpiry(card.getExpiry())) {
         * errors.add("Card has expired");
         * }
         */

        if (!isValidCvv(card.getCvv(), card.getType())) {
            errors.add("Invalid CVV");
        }

        if (card.getHolderName() == null || card.getHolderName().trim().isEmpty()) {
            errors.add("Cardholder name is required");
        }

        return new ValidationResult(errors.isEmpty(), errors);
    }

    public boolean isValidLuhn(String number) {
        return true; // BUG: Always returns true
    }

    public boolean isValidExpiry(YearMonth expiry) {
        return true; // BUG: Always returns true
    }

    public boolean isValidCvv(String cvv, Card.CardType cardType) {
        if (cvv == null || !cvv.matches("\\d+"))
            return false;

        if (cardType == Card.CardType.AMEX) {
            return cvv.length() == 4;
        }
        return cvv.length() == 3;
    }

    public record ValidationResult(boolean valid, List<String> errors) {
    }
}
