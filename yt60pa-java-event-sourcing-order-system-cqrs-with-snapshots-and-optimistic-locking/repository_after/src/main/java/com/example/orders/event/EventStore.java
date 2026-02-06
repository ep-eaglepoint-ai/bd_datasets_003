package com.example.orders.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.List;

@Repository
public class EventStore {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public EventStore(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public void save(Event event) {
        try {
            String payload = objectMapper.writeValueAsString(event);
            jdbcTemplate.update(
                "INSERT INTO events (aggregate_id, aggregate_version, event_type, payload, timestamp, schema_version) VALUES (?, ?, ?, ?, ?, ?)",
                event.getAggregateId(), event.getVersion(), event.getEventType(), payload, Timestamp.from(event.getTimestamp()), event.getSchemaVersion()
            );
        } catch (DuplicateKeyException e) {
            throw new IllegalStateException("Optimistic locking failure: Event with version " + event.getVersion() + " already exists for aggregate " + event.getAggregateId(), e);
        } catch (Exception e) {
            throw new RuntimeException("Failed to save event", e);
        }
    }

    public List<Event> getEvents(String aggregateId, long fromVersion) {
        return jdbcTemplate.query(
            "SELECT * FROM events WHERE aggregate_id = ? AND aggregate_version > ? ORDER BY aggregate_version ASC",
            (rs, rowNum) -> {
                try {
                    String eventType = rs.getString("event_type");
                    String payload = rs.getString("payload");
                    Class<?> eventClass = Class.forName("com.example.orders.event." + eventType);
                    Event event = (Event) objectMapper.readValue(payload, eventClass);
                    event.setVersion(rs.getLong("aggregate_version"));
                    event.setTimestamp(rs.getTimestamp("timestamp").toInstant());
                    event.setSchemaVersion(rs.getInt("schema_version"));
                    return event;
                } catch (Exception e) {
                    throw new RuntimeException("Failed to deserialize event", e);
                }
            },
            aggregateId, fromVersion
        );
    }
}
