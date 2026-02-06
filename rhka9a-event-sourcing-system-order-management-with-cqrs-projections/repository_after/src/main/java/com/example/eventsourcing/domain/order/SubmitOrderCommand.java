package com.example.eventsourcing.domain.order;

/**
 * Command to submit an order.
 * This command has no parameters as submission only requires the order ID,
 * which is provided separately in the service layer.
 */
public class SubmitOrderCommand {
    
    // Optional metadata fields can be added here if needed
    // For example: submittedBy, submissionNotes, etc.
    
    public SubmitOrderCommand() {
    }
}

