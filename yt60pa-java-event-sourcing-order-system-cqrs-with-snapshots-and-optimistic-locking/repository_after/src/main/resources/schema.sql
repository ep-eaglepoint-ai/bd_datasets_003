-- Events table with versioning
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    aggregate_id VARCHAR(255) NOT NULL,
    aggregate_version BIGINT NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    payload TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    schema_version INT DEFAULT 1,
    CONSTRAINT uniq_agg_version UNIQUE (aggregate_id, aggregate_version)
);

-- Snapshots table
CREATE TABLE IF NOT EXISTS snapshots (
    aggregate_id VARCHAR(255) PRIMARY KEY,
    aggregate_version BIGINT NOT NULL,
    snapshot_payload TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL
);

-- Deduplication table for idempotency
CREATE TABLE IF NOT EXISTS processed_commands (
    command_id VARCHAR(255) PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL
);

-- Read Projections
CREATE TABLE IF NOT EXISTS order_projections (
    id VARCHAR(255) PRIMARY KEY,
    customer_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    total_amount DECIMAL(10,2) DEFAULT 0,
    item_count INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
