package com.example.orders.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

@Repository
public class EventStore {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public EventStore(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public void save(String aggregateId, Object event) {
        try {
            String eventType = event.getClass().getSimpleName();
            String payload = objectMapper.writeValueAsString(event);

            jdbcTemplate.update(
                "INSERT INTO events (aggregate_id, event_type, payload, timestamp) VALUES (?, ?, ?, ?)",
                aggregateId, eventType, payload, Timestamp.from(Instant.now())
            );
        } catch (Exception e) {
            throw new RuntimeException("Failed to save event", e);
        }
    }

    public List<Event> getEvents(String aggregateId) {
        return jdbcTemplate.query(
            "SELECT * FROM events WHERE aggregate_id = ? ORDER BY id",
            (rs, rowNum) -> {
                Event event = new Event();
                event.setId(rs.getLong("id"));
                event.setAggregateId(rs.getString("aggregate_id"));
                event.setEventType(rs.getString("event_type"));
                event.setPayload(rs.getString("payload"));
                event.setTimestamp(rs.getTimestamp("timestamp").toInstant());
                return event;
            },
            aggregateId
        );
    }

    public List<Event> getAllEvents() {
        return jdbcTemplate.query(
            "SELECT * FROM events ORDER BY id",
            (rs, rowNum) -> {
                Event event = new Event();
                event.setId(rs.getLong("id"));
                event.setAggregateId(rs.getString("aggregate_id"));
                event.setEventType(rs.getString("event_type"));
                event.setPayload(rs.getString("payload"));
                event.setTimestamp(rs.getTimestamp("timestamp").toInstant());
                return event;
            }
        );
    }
}
