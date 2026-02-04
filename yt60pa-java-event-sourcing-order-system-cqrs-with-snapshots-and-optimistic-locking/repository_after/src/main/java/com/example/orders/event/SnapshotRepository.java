package com.example.orders.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

@Repository
public class SnapshotRepository {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public SnapshotRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public <T> void save(String aggregateId, long version, T aggregateState) {
        try {
            String payload = objectMapper.writeValueAsString(aggregateState);
            jdbcTemplate.update(
                "INSERT INTO snapshots (aggregate_id, aggregate_version, snapshot_payload, timestamp) VALUES (?, ?, ?, ?) " +
                "ON CONFLICT (aggregate_id) DO UPDATE SET aggregate_version = ?, snapshot_payload = ?, timestamp = ?",
                aggregateId, version, payload, Timestamp.from(Instant.now()),
                version, payload, Timestamp.from(Instant.now())
            );
        } catch (Exception e) {
            throw new RuntimeException("Failed to save snapshot", e);
        }
    }

    public <T> Optional<Snapshot<T>> load(String aggregateId, Class<T> aggregateType) {
        List<Snapshot<T>> snapshots = jdbcTemplate.query(
            "SELECT * FROM snapshots WHERE aggregate_id = ?",
            (rs, rowNum) -> {
                try {
                    String payload = rs.getString("snapshot_payload");
                    T aggregate = objectMapper.readValue(payload, aggregateType);
                    long version = rs.getLong("aggregate_version");
                    return new Snapshot<>(aggregate, version);
                } catch (Exception e) {
                    throw new RuntimeException("Failed to deserialize snapshot", e);
                }
            },
            aggregateId
        );
        return snapshots.stream().findFirst();
    }

    public static class Snapshot<T> {
        public final T aggregate;
        public final long version;

        public Snapshot(T aggregate, long version) {
            this.aggregate = aggregate;
            this.version = version;
        }
    }
}
