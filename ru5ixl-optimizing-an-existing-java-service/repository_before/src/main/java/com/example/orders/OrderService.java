package com.example.orders;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.*;

public class OrderService {

    private final Connection connection;

    public OrderService(Connection connection) {
        this.connection = connection;
    }

    public Map<Long, List<Order>> getLatestOrdersPerActiveUser(int n) throws Exception {
        Map<Long, List<Order>> result = new HashMap<>();

        PreparedStatement usersStmt = connection.prepareStatement(
            "SELECT id FROM users WHERE active = true"
        );
        ResultSet usersRs = usersStmt.executeQuery();

        while (usersRs.next()) {
            long userId = usersRs.getLong("id");

            PreparedStatement ordersStmt = connection.prepareStatement(
                "SELECT id, created_at, total " +
                "FROM orders " +
                "WHERE user_id = ? " +
                "ORDER BY created_at DESC " +
                "LIMIT ?"
            );
            ordersStmt.setLong(1, userId);
            ordersStmt.setInt(2, n);

            ResultSet ordersRs = ordersStmt.executeQuery();
            List<Order> orders = new ArrayList<>();

            while (ordersRs.next()) {
                orders.add(
                    new Order(
                        ordersRs.getLong("id"),
                        ordersRs.getTimestamp("created_at").toInstant(),
                        ordersRs.getBigDecimal("total")
                    )
                );
            }

            result.put(userId, orders);
        }

        return result;
    }
}
