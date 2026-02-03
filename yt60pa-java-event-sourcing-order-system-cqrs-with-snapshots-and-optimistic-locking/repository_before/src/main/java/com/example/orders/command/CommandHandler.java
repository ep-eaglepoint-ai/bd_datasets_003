package com.example.orders.command;

import com.example.orders.aggregate.Order;
import com.example.orders.event.Event;
import com.example.orders.event.EventStore;
import com.example.orders.projection.ProjectionHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class CommandHandler {

    private final EventStore eventStore;
    private final ProjectionHandler projectionHandler;
    private final ObjectMapper objectMapper;

    public CommandHandler(EventStore eventStore, ProjectionHandler projectionHandler, ObjectMapper objectMapper) {
        this.eventStore = eventStore;
        this.projectionHandler = projectionHandler;
        this.objectMapper = objectMapper;
    }

    public void handle(CreateOrderCommand command) {
        Order order = new Order();
        order.createOrder(command.orderId, command.customerId);

        for (Object event : order.getPendingEvents()) {
            eventStore.save(command.orderId, event);
            projectionHandler.handle(event);
        }
        order.clearPendingEvents();
    }

    public void handle(AddItemCommand command) {
        Order order = loadAggregate(command.orderId);
        order.addItem(command.productId, command.quantity, command.price);

        for (Object event : order.getPendingEvents()) {
            eventStore.save(command.orderId, event);
            projectionHandler.handle(event);
        }
        order.clearPendingEvents();
    }

    public void handle(RemoveItemCommand command) {
        Order order = loadAggregate(command.orderId);
        order.removeItem(command.productId);

        for (Object event : order.getPendingEvents()) {
            eventStore.save(command.orderId, event);
            projectionHandler.handle(event);
        }
        order.clearPendingEvents();
    }

    public void handle(SubmitOrderCommand command) {
        Order order = loadAggregate(command.orderId);
        order.submit(command.shippingAddress);

        for (Object event : order.getPendingEvents()) {
            eventStore.save(command.orderId, event);
            projectionHandler.handle(event);
        }
        order.clearPendingEvents();
    }

    public void handle(CancelOrderCommand command) {
        Order order = loadAggregate(command.orderId);
        order.cancel(command.reason);

        for (Object event : order.getPendingEvents()) {
            eventStore.save(command.orderId, event);
            projectionHandler.handle(event);
        }
        order.clearPendingEvents();
    }

    public void handle(ReceivePaymentCommand command) {
        Order order = loadAggregate(command.orderId);
        order.receivePayment(command.amount, command.transactionId);

        for (Object event : order.getPendingEvents()) {
            eventStore.save(command.orderId, event);
            projectionHandler.handle(event);
        }
        order.clearPendingEvents();
    }

    public void handle(ShipOrderCommand command) {
        Order order = loadAggregate(command.orderId);
        order.ship(command.trackingNumber);

        for (Object event : order.getPendingEvents()) {
            eventStore.save(command.orderId, event);
            projectionHandler.handle(event);
        }
        order.clearPendingEvents();
    }

    private Order loadAggregate(String aggregateId) {
        List<Event> events = eventStore.getEvents(aggregateId);
        Order order = new Order();
        for (Event event : events) {
            order.apply(event, objectMapper);
        }
        return order;
    }
}
