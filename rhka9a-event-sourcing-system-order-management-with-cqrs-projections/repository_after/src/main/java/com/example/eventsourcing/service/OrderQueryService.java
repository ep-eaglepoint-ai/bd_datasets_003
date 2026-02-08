package com.example.eventsourcing.service;

import com.example.eventsourcing.domain.order.OrderStatus;
import com.example.eventsourcing.infrastructure.projection.OrderProjectionEntity;
import com.example.eventsourcing.infrastructure.projection.OrderProjectionRepository;
import com.example.eventsourcing.service.dto.OrderProjectionDTO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Query service for order operations (read side).
 */
@Service
@Transactional(readOnly = true)
public class OrderQueryService {
    
    @Autowired
    private OrderProjectionRepository repository;
    
    /**
     * Get an order by ID.
     */
    public Optional<OrderProjectionDTO> getOrder(UUID orderId) {
        return repository.findById(orderId)
            .map(this::toDTO);
    }
    
    /**
     * Get all orders for a customer.
     */
    public List<OrderProjectionDTO> getOrdersByCustomer(UUID customerId) {
        return repository.findByCustomerId(customerId).stream()
            .map(this::toDTO)
            .toList();
    }
    
    /**
     * Get orders by status (paginated).
     */
    public Page<OrderProjectionDTO> getOrdersByStatus(OrderStatus status, Pageable pageable) {
        return repository.findByStatus(status, pageable)
            .map(this::toDTO);
    }
    
    /**
     * Get orders by customer and status.
     */
    public List<OrderProjectionDTO> getOrdersByCustomerAndStatus(UUID customerId, OrderStatus status) {
        return repository.findByCustomerIdAndStatus(customerId, status).stream()
            .map(this::toDTO)
            .toList();
    }
    
    /**
     * Convert entity to DTO.
     */
    private OrderProjectionDTO toDTO(OrderProjectionEntity entity) {
        return new OrderProjectionDTO(
            entity.getOrderId(),
            entity.getCustomerId(),
            entity.getStatus(),
            entity.getTotalAmount(),
            entity.getItemCount(),
            entity.getCreatedAt(),
            entity.getSubmittedAt()
        );
    }
}

