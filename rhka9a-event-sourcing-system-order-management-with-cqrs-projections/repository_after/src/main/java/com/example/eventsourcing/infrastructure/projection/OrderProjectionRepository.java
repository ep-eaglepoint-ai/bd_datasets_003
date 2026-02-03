package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.domain.order.OrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface OrderProjectionRepository extends JpaRepository<OrderProjectionEntity, Long> {
    boolean existsByOrderId(String orderId);
    Optional<OrderProjectionEntity> findByOrderId(String orderId);
    List<OrderProjectionEntity> findByCustomerId(String customerId);
    List<OrderProjectionEntity> findByStatus(OrderStatus status);
    List<OrderProjectionEntity> findByCreatedAtAfter(Instant timestamp);
}
