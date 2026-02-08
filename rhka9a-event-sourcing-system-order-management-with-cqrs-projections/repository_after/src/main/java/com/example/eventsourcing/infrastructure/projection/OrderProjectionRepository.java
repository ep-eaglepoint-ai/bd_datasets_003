package com.example.eventsourcing.infrastructure.projection;

import com.example.eventsourcing.domain.order.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Spring Data JPA repository for order projections.
 */
@Repository
public interface OrderProjectionRepository extends JpaRepository<OrderProjectionEntity, UUID> {
    
    /**
     * Find orders by customer ID.
     */
    List<OrderProjectionEntity> findByCustomerId(UUID customerId);
    
    /**
     * Find orders by status.
     */
    Page<OrderProjectionEntity> findByStatus(OrderStatus status, Pageable pageable);
    
    /**
     * Find orders by customer and status.
     */
    List<OrderProjectionEntity> findByCustomerIdAndStatus(UUID customerId, OrderStatus status);
}

