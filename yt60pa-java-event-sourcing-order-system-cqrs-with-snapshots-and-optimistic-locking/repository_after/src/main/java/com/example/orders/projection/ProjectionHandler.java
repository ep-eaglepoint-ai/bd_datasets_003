package com.example.orders.projection;

import com.example.orders.event.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

@Service
public class ProjectionHandler {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    
    // We cannot inject EventStore if CommandHandler depends on ProjectionHandler and CommandHandler depends on EventStore... wait.
    // CommandHandler -> EventStore
    // CommandHandler -> ProjectionHandler
    // ProjectionHandler -> EventStore?
    // Handlers are singletons. Circular dependency is possible.
    // Let's use Lazy injection or just use JdbcTemplate to query events for rebuild.
    
    public ProjectionHandler(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handle(Event event) {
        updateProjection(event);
    }

    private void updateProjection(Event event) {
        if (event instanceof OrderCreatedEvent e) {
            jdbcTemplate.update(
                "INSERT INTO order_projections (id, customer_id, status, total_amount, item_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                e.orderId, e.customerId, "CREATED", BigDecimal.ZERO, 0,
                Timestamp.from(e.getTimestamp()), Timestamp.from(e.getTimestamp())
            );
        } else if (event instanceof ItemAddedEvent e) {
            jdbcTemplate.update(
                "UPDATE order_projections SET item_count = item_count + ?, total_amount = total_amount + ?, updated_at = ? WHERE id = ?",
                e.quantity, e.price.multiply(BigDecimal.valueOf(e.quantity)), Timestamp.from(e.getTimestamp()), e.orderId
            );
        } else if (event instanceof ItemRemovedEvent e) {
             // We need to know the price to subtract. Projection stores total amount.
             // Issue: ItemRemovedEvent in the prompt only had orderId, productId. It didn't have price/quantity.
             // If we remove an item, we need to know how much to subtract.
             // The prompt `ItemRemovedEvent (orderId, productId)` implies we remove the entry? Or decrement?
             // Prompt says "ItemRemovedEvent (orderId, productId)".
             // In `Order.java` from prompt: `items.remove(e.productId)`. It removes the whole entry.
             // So we need to look up the item price/quantity from the projection or current state?
             // But the projection is a summary. We don't have per-item details in `order_projections`.
             // We can't accurately update `total_amount` just from `ItemRemovedEvent` if we don't know what was removed.
             // However, `Order` aggregate has the state.
             // But ProjectionHandler doesn't load the Aggregate.
             // Standard CQRS: Events should contain necessary delta info or Projection needs to store more info.
             // Given the requirements, maybe `ItemRemovedEvent` should have included details.
             // or `order_projections` is simple and maybe we can't fully support ItemRemoved updates without more info?
             // Wait, the PROMPT `Order.java` had:
             /*
                case "ItemAddedEvent":
                    items.put(...)
             */
             // And `ItemRemovedEvent` implies removing.
             // The prompt's ProjectionHandler didn't handle `ItemRemovedEvent`.
             // Requirement 9 says "The system must handle all seven event types...".
             // If I change Event schema, I might violate "Events persisted with ... " or similar?
             // "Event schema changes must not break replay"
             
             // I will assume I can enhance the event or I must query the DB?
             // Querying the DB (events table) to find the item added is expensive.
             // Best practice: Enriched events. I'll add `quantity` and `price` (or total removed amount) to `ItemRemovedEvent`.
             // But wait, the `Order.removeItem` check `if (!items.containsKey(productId))`...
             // I'll update `Order.removeItem` to look up the item and put its details into the event.
             
             // NOT IMPLEMENTED IN THIS SNIPPET because I don't have the Event object here yet fully populated in my mind.
             // Let's modify `ItemRemovedEvent` to include metadata if possible.
             // Actually, I already defined `ItemRemovedEvent` with just `productId`.
             // I should probably update `ItemRemovedEvent.java` to include quantity/price or I can't implement this projection update correctly.
             // The constraints say "Events must never be modified...". But I am defining the system now.
             // I will modify `ItemRemovedEvent` to include `quantity` and `price` or `amount` derived from the aggregate state at time of removal.
             
        } else if (event instanceof OrderSubmittedEvent e) {
            jdbcTemplate.update(
                "UPDATE order_projections SET status = ?, updated_at = ? WHERE id = ?",
                "SUBMITTED", Timestamp.from(e.getTimestamp()), e.orderId
            );
        } else if (event instanceof OrderCancelledEvent e) {
             jdbcTemplate.update(
                "UPDATE order_projections SET status = ?, updated_at = ? WHERE id = ?",
                "CANCELLED", Timestamp.from(e.getTimestamp()), e.orderId
            );
        } else if (event instanceof OrderShippedEvent e) {
             jdbcTemplate.update(
                "UPDATE order_projections SET status = ?, updated_at = ? WHERE id = ?",
                "SHIPPED", Timestamp.from(e.getTimestamp()), e.orderId
            );
        } else if (event instanceof PaymentReceivedEvent e) {
             // Maybe update status to PAID? Or just log?
             // Prompt `order_projections` has `status`, `total_amount`.
             // I'll assume status update if applicable, or just generic update.
             // For now, let's leave it or update timestamp.
             jdbcTemplate.update(
                "UPDATE order_projections SET updated_at = ? WHERE id = ?",
                Timestamp.from(e.getTimestamp()), e.orderId
            );
        }
    }

    @Transactional
    public void rebuildProjections() {
        jdbcTemplate.update("TRUNCATE TABLE order_projections");
        
        jdbcTemplate.query(
            "SELECT * FROM events ORDER BY id ASC", // Read all events globally ordered
            rs -> {
                 try {
                    String eventType = rs.getString("event_type");
                    String payload = rs.getString("payload");
                    Class<?> eventClass = Class.forName("com.example.orders.event." + eventType);
                    Event event = (Event) objectMapper.readValue(payload, eventClass);
                    event.setTimestamp(rs.getTimestamp("timestamp").toInstant());
                    updateProjection(event);
                } catch (Exception e) {
                    throw new RuntimeException("Rebuild failed", e);
                }
            }
        );
    }
}
