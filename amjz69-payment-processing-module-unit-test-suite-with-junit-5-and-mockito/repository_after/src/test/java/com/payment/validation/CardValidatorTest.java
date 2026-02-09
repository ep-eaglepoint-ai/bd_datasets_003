package com.payment.validation;

import com.payment.model.Card;
import com.payment.model.Card.CardType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Clock;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class CardValidatorTest {

    private CardValidator cardValidator;
    private Clock clock;

    @BeforeEach
    void setUp() {
        // Fixed time: 2023-10-01T10:00:00Z
        clock = Clock.fixed(Instant.parse("2023-10-01T10:00:00Z"), ZoneId.of("UTC"));
        cardValidator = new CardValidator(clock);
    }

    @Test
    void validate_shouldReturnFalse_whenCardIsNull() {
        CardValidator.ValidationResult result = cardValidator.validate(null);
        assertThat(result.valid()).isFalse();
        assertThat(result.errors()).contains("Card cannot be null");
    }

    @ParameterizedTest
    @ValueSource(strings = {"4111111111111111", "5555555555554444", "4242424242424242", "4000000000000002"})
    void isValidLuhn_shouldReturnTrue_forValidNumbers(String number) {
        assertThat(cardValidator.isValidLuhn(number)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"4111111111111112", "123", "abc", ""})
    void isValidLuhn_shouldReturnFalse_forInvalidNumbers(String number) {
        assertThat(cardValidator.isValidLuhn(number)).isFalse();
    }
    
    @Test
    void isValidLuhn_shouldReturnFalse_forNull() {
        assertThat(cardValidator.isValidLuhn(null)).isFalse();
    }

    @Test
    void isValidExpiry_shouldReturnTrue_forFutureDate() {
        YearMonth future = YearMonth.now(clock).plusMonths(1);
        assertThat(cardValidator.isValidExpiry(future)).isTrue();
    }

    @Test
    void isValidExpiry_shouldReturnTrue_forCurrentMonth() {
        YearMonth current = YearMonth.now(clock);
        assertThat(cardValidator.isValidExpiry(current)).isTrue();
    }

    @Test
    void isValidExpiry_shouldReturnFalse_forPastDate() {
        YearMonth past = YearMonth.now(clock).minusMonths(1);
        assertThat(cardValidator.isValidExpiry(past)).isFalse();
    }
    
    @Test
    void isValidExpiry_shouldReturnFalse_forNull() {
        assertThat(cardValidator.isValidExpiry(null)).isFalse();
    }

    @ParameterizedTest
    @CsvSource({
        "123, VISA, true",
        "123, MASTERCARD, true",
        "123, DISCOVER, true",
        "1234, AMEX, true",
        "12, VISA, false",
        "1234, VISA, false",
        "123, AMEX, false",
        "abc, VISA, false",
        ", VISA, false"
    })
    void isValidCvv_shouldValidateBasedOnCardType(String cvv, CardType type, boolean expected) {
        assertThat(cardValidator.isValidCvv(cvv, type)).isEqualTo(expected);
    }

    @Test
    void validate_shouldReturnMultipleErrors_whenCardIsInvalid() {
        // Invalid number, expired, invalid CVV, missing name
        Card card = new Card("4111111111111112", "", YearMonth.now(clock).minusMonths(1), "12");
        
        CardValidator.ValidationResult result = cardValidator.validate(card);
        
        assertThat(result.valid()).isFalse();
        assertThat(result.errors()).containsExactlyInAnyOrder(
            "Invalid card number",
            "Card has expired",
            "Invalid CVV",
            "Cardholder name is required"
        );
    }
    
    @Test
    void validate_shouldReturnTrue_whenCardIsValid() {
        Card card = new Card("4242424242424242", "John Doe", YearMonth.now(clock).plusYears(1), "123");
         CardValidator.ValidationResult result = cardValidator.validate(card);
        
        assertThat(result.valid()).isTrue();
        assertThat(result.errors()).isEmpty();
    }
}
