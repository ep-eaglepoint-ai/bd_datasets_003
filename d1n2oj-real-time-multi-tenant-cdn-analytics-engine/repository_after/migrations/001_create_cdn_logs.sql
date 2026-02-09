-- ClickHouse CDN Analytics Schema
-- Engine: ReplacingMergeTree (deduplicates on final merge using event_version)
-- Partitioned by transaction date for fast analytical range queries
-- Ordered by (customer_id, timestamp) for fast per-tenant scans

CREATE TABLE IF NOT EXISTS cdn_analytics.cdn_logs
(
    -- Primary identifiers
    event_id        String,
    customer_id     String,
    timestamp       DateTime64(3, 'UTC'),

    -- Request metadata
    status_code     UInt16,
    bytes_sent      UInt64,
    ip              String,

    -- GeoIP enrichment
    country         LowCardinality(String) DEFAULT '',
    country_code    LowCardinality(String) DEFAULT '',
    city            String DEFAULT '',
    latitude        Float64 DEFAULT 0,
    longitude       Float64 DEFAULT 0,
    timezone        LowCardinality(String) DEFAULT '',
    asn             UInt32 DEFAULT 0,
    asn_org         String DEFAULT '',

    -- Status class for fast aggregation (pre-computed)
    status_class    LowCardinality(String) DEFAULT '',

    -- Ingestion metadata
    ingested_at     DateTime64(3, 'UTC') DEFAULT now64(3),
    event_version   UInt64 DEFAULT 1
)
ENGINE = ReplacingMergeTree(event_version)
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (customer_id, timestamp, event_id)
TTL toDateTime(timestamp) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Materialized view: per-minute aggregates for dashboard queries
CREATE MATERIALIZED VIEW IF NOT EXISTS cdn_analytics.cdn_logs_1m_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMMDD(minute)
ORDER BY (customer_id, minute, status_class)
AS
SELECT
    customer_id,
    toStartOfMinute(timestamp) AS minute,
    status_class,
    count()         AS request_count,
    sum(bytes_sent) AS total_bytes
FROM cdn_analytics.cdn_logs
GROUP BY customer_id, minute, status_class;
