package com.payment.model;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.time.YearMonth;
import static org.assertj.core.api.Assertions.assertThat;

class CardTest {

    private String validNumber;
    private String holder;

    @BeforeEach
    void setUp() {
        validNumber = "4111111111111111";
        holder = "John Doe";
    }

    @Test
    void constructor_shouldDetectCardType() {
        Card visa = new Card(validNumber, holder, YearMonth.now(), "123");
        assertThat(visa.getType()).isEqualTo(Card.CardType.VISA);

        Card mastercard = new Card("5555555555554444", holder, YearMonth.now(), "123");
        assertThat(mastercard.getType()).isEqualTo(Card.CardType.MASTERCARD);
    }

    @Test
    void getMaskedNumber_shouldWork() {
        Card card = new Card(validNumber, holder, YearMonth.now(), "123");
        assertThat(card.getMaskedNumber()).isEqualTo("**** **** **** 1111");
    }

    @Test
    void getMaskedNumber_shouldHandleShortNumbers() {
        Card card = new Card("123", holder, YearMonth.now(), "123");
        assertThat(card.getMaskedNumber()).isEqualTo("****");
    }
}
