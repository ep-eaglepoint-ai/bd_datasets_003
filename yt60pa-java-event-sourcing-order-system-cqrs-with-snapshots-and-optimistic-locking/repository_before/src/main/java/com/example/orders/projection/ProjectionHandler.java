package com.example.orders.projection;

import com.example.orders.event.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;

@Service
public class ProjectionHandler {

    private final JdbcTemplate jdbcTemplate;

    public ProjectionHandler(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void handle(Object event) {
        if (event instanceof OrderCreatedEvent e) {
            jdbcTemplate.update(
                "INSERT INTO order_projections (id, customer_id, status, total_amount, item_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                e.orderId, e.customerId, "CREATED", BigDecimal.ZERO, 0,
                Timestamp.from(Instant.now()), Timestamp.from(Instant.now())
            );
        } else if (event instanceof ItemAddedEvent e) {
            jdbcTemplate.update(
                "UPDATE order_projections SET item_count = item_count + 1, total_amount = total_amount + ?, updated_at = ? WHERE id = ?",
                e.price.multiply(BigDecimal.valueOf(e.quantity)), Timestamp.from(Instant.now()), e.orderId
            );
        } else if (event instanceof ItemRemovedEvent e) {
            jdbcTemplate.update(
                "UPDATE order_projections SET item_count = item_count - 1, updated_at = ? WHERE id = ?",
                Timestamp.from(Instant.now()), e.orderId
            );
        } else if (event instanceof OrderSubmittedEvent e) {
            jdbcTemplate.update(
                "UPDATE order_projections SET status = ?, updated_at = ? WHERE id = ?",
                "SUBMITTED", Timestamp.from(Instant.now()), e.orderId
            );
        } else if (event instanceof OrderCancelledEvent e) {
            jdbcTemplate.update(
                "UPDATE order_projections SET status = ?, updated_at = ? WHERE id = ?",
                "CANCELLED", Timestamp.from(Instant.now()), e.orderId
            );
        } else if (event instanceof PaymentReceivedEvent e) {
            jdbcTemplate.update(
                "UPDATE order_projections SET status = ?, updated_at = ? WHERE id = ?",
                "PAID", Timestamp.from(Instant.now()), e.orderId
            );
        } else if (event instanceof OrderShippedEvent e) {
            jdbcTemplate.update(
                "UPDATE order_projections SET status = ?, updated_at = ? WHERE id = ?",
                "SHIPPED", Timestamp.from(Instant.now()), e.orderId
            );
        }
    }

    public void rebuild() {
        jdbcTemplate.update("DELETE FROM order_projections");
    }
}
