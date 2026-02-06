package com.example.eventsourcing.domain.order;

import com.example.eventsourcing.domain.Aggregate;
import com.example.eventsourcing.domain.DomainEvent;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Aggregate representing an order in the system.
 * Handles CreateOrder, AddItem, RemoveItem, and SubmitOrder commands.
 */
public class OrderAggregate extends Aggregate<DomainEvent> {
    
    private String customerId;
    private OrderStatus status;
    private BigDecimal totalAmount;
    private Map<String, OrderItem> items;
    private Instant createdAt;
    private Instant submittedAt;
    
    public OrderAggregate() {
        super();
        this.items = new HashMap<>();
        this.totalAmount = BigDecimal.ZERO;
    }
    
    public OrderAggregate(String aggregateId, Long version) {
        super(aggregateId, version);
        this.items = new HashMap<>();
        this.totalAmount = BigDecimal.ZERO;
    }
    
    /**
     * Create a new order with the given customer ID.
     */
    public static OrderAggregate createOrder(String customerId) {
        OrderAggregate aggregate = new OrderAggregate();
        aggregate.setAggregateId(UUID.randomUUID().toString());
        aggregate.setCustomerId(customerId);
        aggregate.setStatus(OrderStatus.DRAFT);
        aggregate.setTotalAmount(BigDecimal.ZERO);
        aggregate.setCreatedAt(Instant.now());
        
        OrderCreatedEvent event = new OrderCreatedEvent(
                aggregate.getAggregateId(),
                1L,
                customerId,
                BigDecimal.ZERO
        );
        aggregate.registerEvent(event);
        
        return aggregate;
    }
    
    /**
     * Add an item to the order.
     * Only allowed when order is in DRAFT status.
     */
    public void addItem(String productId, String productName, int quantity, BigDecimal unitPrice) {
        validateDraftStatus();
        validateAddItemParams(productId, productName, quantity, unitPrice);
        
        OrderItemAddedEvent event = new OrderItemAddedEvent(
                getAggregateId(),
                getNextVersion(),
                productId,
                productName,
                quantity,
                unitPrice,
                getTotalAmount().add(unitPrice.multiply(BigDecimal.valueOf(quantity)))
        );
        registerEvent(event);
    }
    
    /**
     * Remove an item from the order.
     * Only allowed when order is in DRAFT status.
     */
    public void removeItem(String productId) {
        validateDraftStatus();
        validateRemoveItemParams(productId);
        
        OrderItem item = items.get(productId);
        if (item == null) {
            return; // Item not found, nothing to remove
        }
        
        BigDecimal itemTotal = item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
        BigDecimal newTotal = getTotalAmount().subtract(itemTotal);
        
        OrderItemRemovedEvent event = new OrderItemRemovedEvent(
                getAggregateId(),
                getNextVersion(),
                productId,
                item.getQuantity(),
                getTotalAmount(),
                newTotal
        );
        registerEvent(event);
    }
    
    /**
     * Submit the order.
     * Only allowed when order is in DRAFT status and has at least one item.
     */
    public void submitOrder() {
        validateDraftStatus();
        validateCanSubmit();
        
        OrderSubmittedEvent event = new OrderSubmittedEvent(
                getAggregateId(),
                getNextVersion(),
                getCustomerId(),
                getTotalAmount(),
                items.size()
        );
        registerEvent(event);
    }
    
    @Override
    public String getAggregateType() {
        return "OrderAggregate";
    }
    
    /**
     * Apply DomainEvent to rebuild aggregate state (dispatches to specific event handlers).
     */
    @Override
    public void apply(DomainEvent event) {
        if (event instanceof OrderCreatedEvent) {
            apply((OrderCreatedEvent) event);
        } else if (event instanceof OrderItemAddedEvent) {
            apply((OrderItemAddedEvent) event);
        } else if (event instanceof OrderItemRemovedEvent) {
            apply((OrderItemRemovedEvent) event);
        } else if (event instanceof OrderSubmittedEvent) {
            apply((OrderSubmittedEvent) event);
        }
    }
    
    /**
     * Apply OrderCreatedEvent to rebuild aggregate state.
     */
    public void apply(OrderCreatedEvent event) {
        setAggregateId(event.getAggregateId());
        setCustomerId(event.getCustomerId());
        setStatus(OrderStatus.DRAFT);
        setTotalAmount(event.getTotalAmount());
        this.items = new HashMap<>();
        setCreatedAt(event.getTimestamp());
        setSubmittedAt(null);
    }
    
    /**
     * Apply OrderItemAddedEvent to rebuild aggregate state.
     */
    public void apply(OrderItemAddedEvent event) {
        OrderItem item = new OrderItem(
                event.getProductId(),
                event.getProductName(),
                event.getQuantity(),
                event.getUnitPrice()
        );
        items.put(event.getProductId(), item);
        setTotalAmount(event.getTotalAmount());
    }
    
    /**
     * Apply OrderItemRemovedEvent to rebuild aggregate state.
     */
    public void apply(OrderItemRemovedEvent event) {
        OrderItem item = items.get(event.getProductId());
        if (item != null) {
            BigDecimal itemTotal = item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
            setTotalAmount(getTotalAmount().subtract(itemTotal));
        }
        items.remove(event.getProductId());
    }
    
    /**
     * Apply OrderSubmittedEvent to rebuild aggregate state.
     */
    public void apply(OrderSubmittedEvent event) {
        setStatus(OrderStatus.SUBMITTED);
        setSubmittedAt(event.getTimestamp());
    }
    
    // Getters
    public String getCustomerId() {
        return customerId;
    }
    
    public OrderStatus getStatus() {
        return status;
    }
    
    public BigDecimal getTotalAmount() {
        return totalAmount;
    }
    
    public Map<String, OrderItem> getItems() {
        return new HashMap<>(items);
    }
    
    public int getItemCount() {
        return items.size();
    }
    
    public Instant getCreatedAt() {
        return createdAt;
    }
    
    public Instant getSubmittedAt() {
        return submittedAt;
    }
    
    // Setters (for internal use during state reconstruction)
    protected void setCustomerId(String customerId) {
        this.customerId = customerId;
    }
    
    protected void setStatus(OrderStatus status) {
        this.status = status;
    }
    
    protected void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount;
    }
    
    protected void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
    
    protected void setSubmittedAt(Instant submittedAt) {
        this.submittedAt = submittedAt;
    }
    
    /**
     * Set the items map (for internal use during state reconstruction from snapshots).
     */
    protected void setItems(Map<String, OrderItem> items) {
        this.items = items != null ? new HashMap<>(items) : new HashMap<>();
    }
    
    /**
     * Restore state from a snapshot aggregate.
     * This method is called by OrderAggregateRepository to restore all state fields
     * from a snapshot. It's public to allow access from the infrastructure package.
     * 
     * @param snapshotAggregate The aggregate loaded from snapshot
     */
    public void restoreFromSnapshot(OrderAggregate snapshotAggregate) {
        if (snapshotAggregate == null) {
            return;
        }
        
        // Copy all state fields from snapshot
        setCustomerId(snapshotAggregate.getCustomerId());
        setStatus(snapshotAggregate.getStatus());
        setTotalAmount(snapshotAggregate.getTotalAmount());
        setItems(snapshotAggregate.getItems());
        setCreatedAt(snapshotAggregate.getCreatedAt());
        setSubmittedAt(snapshotAggregate.getSubmittedAt());
    }
    
    // Validation methods
    private void validateDraftStatus() {
        if (status != OrderStatus.DRAFT) {
            throw new IllegalStateException(
                    "Cannot modify order when status is " + status + ". Only DRAFT orders can be modified.");
        }
    }
    
    private void validateAddItemParams(String productId, String productName, int quantity, BigDecimal unitPrice) {
        if (productId == null || productId.isBlank()) {
            throw new IllegalArgumentException("Product ID cannot be null or empty");
        }
        if (productName == null || productName.isBlank()) {
            throw new IllegalArgumentException("Product name cannot be null or empty");
        }
        if (quantity <= 0) {
            throw new IllegalArgumentException("Quantity must be positive");
        }
        if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Unit price must be positive");
        }
    }
    
    private void validateRemoveItemParams(String productId) {
        if (productId == null || productId.isBlank()) {
            throw new IllegalArgumentException("Product ID cannot be null or empty");
        }
    }
    
    private void validateCanSubmit() {
        if (items.isEmpty()) {
            throw new IllegalStateException("Cannot submit empty order. Order must have at least one item.");
        }
    }
}
