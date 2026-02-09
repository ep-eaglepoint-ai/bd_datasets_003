package com.payment.model;

import java.time.YearMonth;

public class Card {
    private String number;
    private String holderName;
    private YearMonth expiry;
    private String cvv;
    private CardType type;

    public enum CardType {
        VISA, MASTERCARD, AMEX, DISCOVER, UNKNOWN
    }

    public Card(String number, String holderName, YearMonth expiry, String cvv) {
        this.number = number;
        this.holderName = holderName;
        this.expiry = expiry;
        this.cvv = cvv;
        // BUG: Always detects as VISA
        this.type = CardType.VISA;
    }

    private CardType detectCardType(String number) {
        if (number == null || number.isEmpty())
            return CardType.UNKNOWN;
        if (number.startsWith("4"))
            return CardType.VISA;
        if (number.startsWith("5"))
            return CardType.MASTERCARD;
        if (number.startsWith("34") || number.startsWith("37"))
            return CardType.AMEX;
        if (number.startsWith("6"))
            return CardType.DISCOVER;
        return CardType.UNKNOWN;
    }

    public String getNumber() {
        return number;
    }

    public String getHolderName() {
        return holderName;
    }

    public YearMonth getExpiry() {
        return expiry;
    }

    public String getCvv() {
        return cvv;
    }

    public CardType getType() {
        return type;
    }

    public String getMaskedNumber() {
        // BUG: Incorrect masking logic, exposes more digits or wrong ones
        if (number == null || number.length() < 4)
            return "****";
        return number.substring(0, 4) + " **** **** ****";
    }
}
