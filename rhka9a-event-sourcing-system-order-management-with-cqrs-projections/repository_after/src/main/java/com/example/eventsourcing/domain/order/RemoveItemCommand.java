package com.example.eventsourcing.domain.order;

import jakarta.validation.constraints.NotBlank;

/**
 * Command to remove an item from an order.
 */
public class RemoveItemCommand {
    
    @NotBlank(message = "Product ID is required")
    private String productId;
    
    public RemoveItemCommand() {
    }
    
    public RemoveItemCommand(String productId) {
        this.productId = productId;
    }
    
    public String getProductId() {
        return productId;
    }
    
    public void setProductId(String productId) {
        this.productId = productId;
    }
}

