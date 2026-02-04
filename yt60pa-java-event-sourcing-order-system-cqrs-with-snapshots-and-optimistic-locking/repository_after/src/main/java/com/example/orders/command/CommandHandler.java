package com.example.orders.command;

import com.example.orders.aggregate.Order;
import com.example.orders.event.Event;
import com.example.orders.event.EventStore;
import com.example.orders.event.SnapshotRepository;
import com.example.orders.event.SnapshotRepository.Snapshot;
import com.example.orders.projection.ProjectionHandler;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class CommandHandler {

    private final EventStore eventStore;
    private final SnapshotRepository snapshotRepository;
    private final ProjectionHandler projectionHandler;
    private final JdbcTemplate jdbcTemplate;

    private static final int SNAPSHOT_THRESHOLD = 100;

    public CommandHandler(EventStore eventStore, SnapshotRepository snapshotRepository, ProjectionHandler projectionHandler, JdbcTemplate jdbcTemplate) {
        this.eventStore = eventStore;
        this.snapshotRepository = snapshotRepository;
        this.projectionHandler = projectionHandler;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public void handle(Commands.CreateOrderCommand command) {
        checkIdempotency(command.idempotencyKey());
        Order order = new Order();
        order.createOrder(command.orderId(), command.customerId());
        saveAndPublish(order);
    }

    @Transactional
    public void handle(Commands.AddItemCommand command) {
        checkIdempotency(command.idempotencyKey());
        Order order = loadAggregate(command.orderId());
        order.addItem(command.productId(), command.quantity(), command.price());
        saveAndPublish(order);
    }

    @Transactional
    public void handle(Commands.RemoveItemCommand command) {
        checkIdempotency(command.idempotencyKey());
        Order order = loadAggregate(command.orderId());
        order.removeItem(command.productId());
        saveAndPublish(order);
    }

    @Transactional
    public void handle(Commands.SubmitOrderCommand command) {
        checkIdempotency(command.idempotencyKey());
        Order order = loadAggregate(command.orderId());
        order.submit(command.shippingAddress());
        saveAndPublish(order);
    }

    @Transactional
    public void handle(Commands.CancelOrderCommand command) {
        checkIdempotency(command.idempotencyKey());
        Order order = loadAggregate(command.orderId());
        order.cancel(command.reason());
        saveAndPublish(order);
    }

    @Transactional
    public void handle(Commands.PaymentReceivedCommand command) {
        checkIdempotency(command.idempotencyKey());
        Order order = loadAggregate(command.orderId());
        order.paymentReceived(command.amount(), command.transactionId());
        saveAndPublish(order);
    }

    @Transactional
    public void handle(Commands.ShipOrderCommand command) {
        checkIdempotency(command.idempotencyKey());
        Order order = loadAggregate(command.orderId());
        order.ship(command.trackingNumber());
        saveAndPublish(order);
    }

    private void checkIdempotency(String idempotencyKey) {
        try {
            jdbcTemplate.update("INSERT INTO processed_commands (command_id, timestamp) VALUES (?, ?)", idempotencyKey, Timestamp.from(Instant.now()));
        } catch (DuplicateKeyException e) {
            throw new IllegalArgumentException("Duplicate command: " + idempotencyKey);
        }
    }

    private Order loadAggregate(String aggregateId) {
        Optional<Snapshot<Order>> snapshotOpt = snapshotRepository.load(aggregateId, Order.class);
        Order order;
        long fromVersion = 0;

        if (snapshotOpt.isPresent()) {
            order = Order.restore(snapshotOpt.get());
            fromVersion = order.getVersion();
        } else {
            order = new Order();
        }

        List<Event> events = eventStore.getEvents(aggregateId, fromVersion);
        order.replay(events);
        return order;
    }

    private void saveAndPublish(Order order) {
        long currentVersion = order.getVersion();
        for (Event event : order.getNewEvents()) {
            currentVersion++;
            event.setVersion(currentVersion);
            eventStore.save(event);
            projectionHandler.handle(event);
        }
        
        // Check snapshot threshold
        // Ideally we check if version % 100 == 0 but if multiple events added, we might skip it.
        // So we check if floor(oldVersion / 100) < floor(newVersion / 100)
        long oldVersion = order.getVersion();
        if ((oldVersion / SNAPSHOT_THRESHOLD) < (currentVersion / SNAPSHOT_THRESHOLD)) {
            // Update the order version to the latest before saving snapshot
            order.setVersion(currentVersion); 
            snapshotRepository.save(order.getId(), currentVersion, order);
        }
        
        // Update order version in memory (though we're done with it)
        order.setVersion(currentVersion);
        order.clearNewEvents();
    }
}
