-- Drop existing tables (for clean recreation)
DROP TABLE IF EXISTS processed_events CASCADE;
DROP TABLE IF EXISTS order_projections CASCADE;
DROP TABLE IF EXISTS aggregate_snapshots CASCADE;
DROP TABLE IF EXISTS event_store CASCADE;

-- Event Store Table
CREATE TABLE event_store (
    event_id UUID PRIMARY KEY,
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(500) NOT NULL,
    event_version BIGINT NOT NULL,
    event_type VARCHAR(500) NOT NULL,
    event_payload JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    CONSTRAINT unique_aggregate_version UNIQUE (aggregate_id, event_version)
);

CREATE INDEX idx_event_aggregate_id ON event_store(aggregate_id);
CREATE INDEX idx_event_created_at ON event_store(created_at);
CREATE INDEX idx_event_type ON event_store(event_type);

-- Aggregate Snapshots Table
CREATE TABLE aggregate_snapshots (
    snapshot_id UUID PRIMARY KEY,
    aggregate_id UUID NOT NULL UNIQUE,
    aggregate_type VARCHAR(500) NOT NULL,
    snapshot_version BIGINT NOT NULL,
    snapshot_data JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_snapshot_aggregate_id ON aggregate_snapshots(aggregate_id);
CREATE INDEX idx_snapshot_created_at ON aggregate_snapshots(created_at);

-- Order Projections Table (Read Model)
CREATE TABLE order_projections (
    order_id UUID PRIMARY KEY,
    customer_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL,
    total_amount DECIMAL(19, 2) NOT NULL,
    item_count INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL,
    submitted_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_projection_customer_id ON order_projections(customer_id);
CREATE INDEX idx_projection_status ON order_projections(status);
CREATE INDEX idx_projection_created_at ON order_projections(created_at);

-- Processed Events Table (for idempotency tracking, optional)
CREATE TABLE processed_events (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    projection_name VARCHAR(255) NOT NULL,
    processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_processed_event_id ON processed_events(event_id);
CREATE INDEX idx_processed_projection_name ON processed_events(projection_name);

-- Comments
COMMENT ON TABLE event_store IS 'Append-only event store with optimistic locking';
COMMENT ON TABLE aggregate_snapshots IS 'Aggregate snapshots for performance optimization';
COMMENT ON TABLE order_projections IS 'Denormalized read model for order queries';
COMMENT ON TABLE processed_events IS 'Tracks processed events for idempotency';

