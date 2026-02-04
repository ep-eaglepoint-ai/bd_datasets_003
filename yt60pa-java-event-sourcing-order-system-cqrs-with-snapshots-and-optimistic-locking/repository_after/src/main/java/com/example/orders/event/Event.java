package com.example.orders.event;

import java.time.Instant;

public abstract class Event {
    private String aggregateId;
    private long version; // Aggregate version
    private Instant timestamp;
    private int schemaVersion = 1;

    public Event() {}

    public Event(String aggregateId) {
        this.aggregateId = aggregateId;
        this.timestamp = Instant.now();
    }

    public String getEventType() {
        return this.getClass().getSimpleName();
    }

    public String getAggregateId() {
        return aggregateId;
    }

    public void setAggregateId(String aggregateId) {
        this.aggregateId = aggregateId;
    }

    public long getVersion() {
        return version;
    }

    public void setVersion(long version) {
        this.version = version;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(int schemaVersion) {
        this.schemaVersion = schemaVersion;
    }
}
