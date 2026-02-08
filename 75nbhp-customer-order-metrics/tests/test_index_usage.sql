DROP TABLE IF EXISTS orders CASCADE;
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id BIGINT,
    status TEXT,
    total_price NUMERIC,
    created_at TIMESTAMP
);

INSERT INTO orders (customer_id, status, total_price, created_at)
SELECT 
    1, 
    CASE WHEN i % 2 = 0 THEN 'COMPLETED' ELSE 'CANCELLED' END,
    100.00,
    '2023-01-01 10:00:00'::TIMESTAMP + (i || ' days')::INTERVAL
FROM generate_series(1, 1000) i;

CREATE INDEX idx_orders_cust_date ON orders(customer_id, created_at);
ANALYZE orders;

SELECT pg_stat_reset();

EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM get_customer_order_metrics(1, '2023-01-01', '2023-02-01');

DO $$
DECLARE
    v_func_src TEXT;
BEGIN

    SELECT prosrc INTO v_func_src
    FROM pg_proc
    WHERE proname = 'get_customer_order_metrics';

    IF v_func_src ILIKE '%DATE(created_at)%' THEN
        RAISE EXCEPTION 'Performance Anti-Pattern Detected: DATE(created_at) is used in specific predicate, protecting the column from index usage.';
    END IF;


    IF v_func_src NOT LIKE '%>=%' OR v_func_src NOT LIKE '%<%' THEN 
       RAISE NOTICE 'Warning: Range comparators not explicitly detected found in function source. Ensure sargable date usage.';
    END IF;

END$$;
