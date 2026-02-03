package com.example.eventsourcing.domain.order;

import jakarta.validation.constraints.NotBlank;

/**
 * Command to create a new order.
 */
public class CreateOrderCommand {
    
    @NotBlank(message = "Customer ID is required")
    private String customerId;
    
    public CreateOrderCommand() {
    }
    
    public CreateOrderCommand(String customerId) {
        this.customerId = customerId;
    }
    
    public String getCustomerId() {
        return customerId;
    }
    
    public void setCustomerId(String customerId) {
        this.customerId = customerId;
    }
}
