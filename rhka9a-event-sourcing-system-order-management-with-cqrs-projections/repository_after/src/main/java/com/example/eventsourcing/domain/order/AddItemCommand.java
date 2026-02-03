package com.example.eventsourcing.domain.order;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

/**
 * Command to add an item to an order.
 */
public class AddItemCommand {
    
    @NotBlank(message = "Product ID is required")
    private String productId;
    
    @NotBlank(message = "Product name is required")
    private String productName;
    
    @Positive(message = "Quantity must be positive")
    private int quantity;
    
    @Positive(message = "Unit price must be positive")
    private BigDecimal unitPrice;
    
    public AddItemCommand() {
    }
    
    public AddItemCommand(String productId, String productName, int quantity, BigDecimal unitPrice) {
        this.productId = productId;
        this.productName = productName;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
    }
    
    public String getProductId() {
        return productId;
    }
    
    public void setProductId(String productId) {
        this.productId = productId;
    }
    
    public String getProductName() {
        return productName;
    }
    
    public void setProductName(String productName) {
        this.productName = productName;
    }
    
    public int getQuantity() {
        return quantity;
    }
    
    public void setQuantity(int quantity) {
        this.quantity = quantity;
    }
    
    public BigDecimal getUnitPrice() {
        return unitPrice;
    }
    
    public void setUnitPrice(BigDecimal unitPrice) {
        this.unitPrice = unitPrice;
    }
}
