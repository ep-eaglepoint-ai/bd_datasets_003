package com.example.orders.query;

import com.example.orders.projection.OrderProjection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class OrderQueryService {

    private final JdbcTemplate jdbcTemplate;

    public OrderQueryService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public OrderProjection getOrder(String orderId) {
        return jdbcTemplate.queryForObject(
            "SELECT * FROM order_projections WHERE id = ?",
            (rs, rowNum) -> {
                OrderProjection p = new OrderProjection();
                p.id = rs.getString("id");
                p.customerId = rs.getString("customer_id");
                p.status = rs.getString("status");
                p.totalAmount = rs.getBigDecimal("total_amount");
                p.itemCount = rs.getInt("item_count");
                p.createdAt = rs.getTimestamp("created_at").toInstant();
                p.updatedAt = rs.getTimestamp("updated_at").toInstant();
                return p;
            },
            orderId
        );
    }

    public List<OrderProjection> getOrdersByCustomer(String customerId) {
        return jdbcTemplate.query(
            "SELECT * FROM order_projections WHERE customer_id = ? ORDER BY created_at DESC",
            (rs, rowNum) -> {
                OrderProjection p = new OrderProjection();
                p.id = rs.getString("id");
                p.customerId = rs.getString("customer_id");
                p.status = rs.getString("status");
                p.totalAmount = rs.getBigDecimal("total_amount");
                p.itemCount = rs.getInt("item_count");
                p.createdAt = rs.getTimestamp("created_at").toInstant();
                p.updatedAt = rs.getTimestamp("updated_at").toInstant();
                return p;
            },
            customerId
        );
    }

    public List<OrderProjection> getOrdersByStatus(String status) {
        return jdbcTemplate.query(
            "SELECT * FROM order_projections WHERE status = ? ORDER BY created_at DESC",
            (rs, rowNum) -> {
                OrderProjection p = new OrderProjection();
                p.id = rs.getString("id");
                p.customerId = rs.getString("customer_id");
                p.status = rs.getString("status");
                p.totalAmount = rs.getBigDecimal("total_amount");
                p.itemCount = rs.getInt("item_count");
                p.createdAt = rs.getTimestamp("created_at").toInstant();
                p.updatedAt = rs.getTimestamp("updated_at").toInstant();
                return p;
            },
            status
        );
    }

    public List<OrderProjection> getAllOrders() {
        return jdbcTemplate.query(
            "SELECT * FROM order_projections ORDER BY created_at DESC",
            (rs, rowNum) -> {
                OrderProjection p = new OrderProjection();
                p.id = rs.getString("id");
                p.customerId = rs.getString("customer_id");
                p.status = rs.getString("status");
                p.totalAmount = rs.getBigDecimal("total_amount");
                p.itemCount = rs.getInt("item_count");
                p.createdAt = rs.getTimestamp("created_at").toInstant();
                p.updatedAt = rs.getTimestamp("updated_at").toInstant();
                return p;
            }
        );
    }
}
