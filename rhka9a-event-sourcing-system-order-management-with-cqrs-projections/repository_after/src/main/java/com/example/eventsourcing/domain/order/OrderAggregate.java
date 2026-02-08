package com.example.eventsourcing.domain.order;

import com.example.eventsourcing.domain.Aggregate;
import com.example.eventsourcing.domain.DomainEvent;
import com.example.eventsourcing.exception.EmptyOrderException;
import com.example.eventsourcing.exception.InvalidOrderStatusException;
import com.example.eventsourcing.exception.ItemNotFoundException;
import com.example.eventsourcing.exception.UnknownEventTypeException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Order aggregate root.
 * Implements business logic for order management using event sourcing.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class OrderAggregate extends Aggregate {
    
    // State fields (reconstructed from events)
    private UUID customerId;
    private OrderStatus status;
    private Map<UUID, OrderItem> items;
    private BigDecimal totalAmount;
    private Instant createdAt;
    private Instant submittedAt;
    
    /**
     * Constructor for new aggregates.
     */
    public OrderAggregate() {
        super();
        this.items = new HashMap<>();
        this.totalAmount = BigDecimal.ZERO;
    }
    
    /**
     * Constructor for loading from history.
     */
    public OrderAggregate(UUID aggregateId) {
        this();
        this.aggregateId = aggregateId;
    }
    
    
    // ========== COMMANDS ==========
    
    /**
     * Create a new order.
     */
    public void createOrder(UUID customerId) {
        // Validation
        if (this.aggregateId == null) {
            throw new IllegalStateException("Aggregate ID must be set before creating order");
        }
        if (this.version > 0) {
            throw new IllegalStateException("Order already created");
        }
        Objects.requireNonNull(customerId, "Customer ID cannot be null");
        
        // Create and apply event
        OrderCreatedEvent event = new OrderCreatedEvent(
            UUID.randomUUID(),
            this.aggregateId,
            1L,
            Instant.now(),
            customerId
        );
        applyNewEvent(event);
    }
    
    /**
     * Add an item to the order.
     */
    public void addItem(UUID productId, int quantity, BigDecimal unitPrice) {
        ensureAggregateId();
        
        // Business rule validation
        if (status != OrderStatus.DRAFT) {
            throw new InvalidOrderStatusException(
                "Items can only be added to orders in DRAFT status. Current status: " + status);
        }
        if (quantity <= 0) {
            throw new IllegalArgumentException("Quantity must be positive");
        }
        Objects.requireNonNull(productId, "Product ID cannot be null");
        Objects.requireNonNull(unitPrice, "Unit price cannot be null");
        if (unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Unit price must be positive");
        }
        
        // Create and apply event
        OrderItemAddedEvent event = new OrderItemAddedEvent(
            UUID.randomUUID(),
            this.aggregateId,
            this.version + 1,
            Instant.now(),
            productId,
            quantity,
            unitPrice
        );
        applyNewEvent(event);
    }
    
    /**
     * Remove an item from the order.
     */
    public void removeItem(UUID productId) {
        ensureAggregateId();
        
        // Business rule validation
        if (status != OrderStatus.DRAFT) {
            throw new InvalidOrderStatusException(
                "Items can only be removed from orders in DRAFT status. Current status: " + status);
        }
        if (!items.containsKey(productId)) {
            throw new ItemNotFoundException("Product not found in order: " + productId);
        }
        
        // Create and apply event
        OrderItemRemovedEvent event = new OrderItemRemovedEvent(
            UUID.randomUUID(),
            this.aggregateId,
            this.version + 1,
            Instant.now(),
            productId
        );
        applyNewEvent(event);
    }
    
    /**
     * Submit the order.
     */
    public void submitOrder() {
        ensureAggregateId();
        
        // Business rule validation
        if (status != OrderStatus.DRAFT) {
            throw new InvalidOrderStatusException(
                "Only DRAFT orders can be submitted. Current status: " + status);
        }
        if (items.isEmpty()) {
            throw new EmptyOrderException("Cannot submit an empty order");
        }
        
        // Create and apply event
        OrderSubmittedEvent event = new OrderSubmittedEvent(
            UUID.randomUUID(),
            this.aggregateId,
            this.version + 1,
            Instant.now()
        );
        applyNewEvent(event);
    }
    
    // ========== EVENT HANDLERS ==========
    
    @Override
    protected void applyEvent(DomainEvent event) {
        if (event instanceof OrderCreatedEvent) {
            handleOrderCreated((OrderCreatedEvent) event);
        } else if (event instanceof OrderItemAddedEvent) {
            handleItemAdded((OrderItemAddedEvent) event);
        } else if (event instanceof OrderItemRemovedEvent) {
            handleItemRemoved((OrderItemRemovedEvent) event);
        } else if (event instanceof OrderSubmittedEvent) {
            handleOrderSubmitted((OrderSubmittedEvent) event);
        } else {
            throw new UnknownEventTypeException(
                "Unknown event type: " + event.getClass().getName());
        }
    }
    
    private void handleOrderCreated(OrderCreatedEvent event) {
        this.customerId = event.customerId();
        this.status = OrderStatus.DRAFT;
        this.items = new HashMap<>();
        this.totalAmount = BigDecimal.ZERO;
        this.createdAt = event.occurredAt();
    }
    
    private void handleItemAdded(OrderItemAddedEvent event) {
        OrderItem item = new OrderItem(
            event.productId(),
            event.quantity(),
            event.unitPrice()
        );
        
        // If product already exists, update (replace)
        items.put(event.productId(), item);
        
        // Recalculate total
        recalculateTotal();
    }
    
    private void handleItemRemoved(OrderItemRemovedEvent event) {
        items.remove(event.productId());
        recalculateTotal();
    }
    
    private void handleOrderSubmitted(OrderSubmittedEvent event) {
        this.status = OrderStatus.SUBMITTED;
        this.submittedAt = event.occurredAt();
    }
    
    private void recalculateTotal() {
        this.totalAmount = items.values().stream()
            .map(OrderItem::getTotalPrice)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
    
    // ========== GETTERS ==========
    
    public UUID getCustomerId() {
        return customerId;
    }
    
    public OrderStatus getStatus() {
        return status;
    }
    
    public Map<UUID, OrderItem> getItems() {
        return new HashMap<>(items);
    }
    
    public BigDecimal getTotalAmount() {
        return totalAmount;
    }
    
    public Instant getCreatedAt() {
        return createdAt;
    }
    
    public Instant getSubmittedAt() {
        return submittedAt;
    }
    
    // Setters for Jackson deserialization
    public void setAggregateId(UUID aggregateId) {
        this.aggregateId = aggregateId;
    }
    
    public void setVersion(Long version) {
        this.version = version;
    }
    
    public void setCustomerId(UUID customerId) {
        this.customerId = customerId;
    }
    
    public void setStatus(OrderStatus status) {
        this.status = status;
    }
    
    public void setItems(Map<UUID, OrderItem> items) {
        this.items = items != null ? new HashMap<>(items) : new HashMap<>();
    }
    
    public void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount != null ? totalAmount : BigDecimal.ZERO;
    }
    
    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
    
    public void setSubmittedAt(Instant submittedAt) {
        this.submittedAt = submittedAt;
    }
}

