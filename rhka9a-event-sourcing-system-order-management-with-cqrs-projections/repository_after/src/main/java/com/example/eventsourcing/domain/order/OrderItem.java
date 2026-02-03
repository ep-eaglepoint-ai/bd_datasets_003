package com.example.eventsourcing.domain.order;

import java.math.BigDecimal;
import java.util.Objects;

/**
 * Represents an item in an order.
 */
public class OrderItem {
    
    private final String productId;
    private final String productName;
    private final int quantity;
    private final BigDecimal unitPrice;
    private final BigDecimal totalPrice;
    
    public OrderItem(String productId, String productName, int quantity, BigDecimal unitPrice) {
        this.productId = Objects.requireNonNull(productId, "Product ID cannot be null");
        this.productName = Objects.requireNonNull(productName, "Product name cannot be null");
        this.quantity = quantity;
        this.unitPrice = Objects.requireNonNull(unitPrice, "Unit price cannot be null");
        this.totalPrice = unitPrice.multiply(BigDecimal.valueOf(quantity));
    }
    
    public String getProductId() {
        return productId;
    }
    
    public String getProductName() {
        return productName;
    }
    
    public int getQuantity() {
        return quantity;
    }
    
    public BigDecimal getUnitPrice() {
        return unitPrice;
    }
    
    public BigDecimal getTotalPrice() {
        return totalPrice;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        OrderItem orderItem = (OrderItem) o;
        return quantity == orderItem.quantity &&
               Objects.equals(productId, orderItem.productId) &&
               Objects.equals(productName, orderItem.productName) &&
               Objects.equals(unitPrice, orderItem.unitPrice) &&
               Objects.equals(totalPrice, orderItem.totalPrice);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(productId, productName, quantity, unitPrice, totalPrice);
    }
    
    @Override
    public String toString() {
        return "OrderItem{" +
               "productId='" + productId + '\'' +
               ", productName='" + productName + '\'' +
               ", quantity=" + quantity +
               ", unitPrice=" + unitPrice +
               ", totalPrice=" + totalPrice +
               '}';
    }
}
