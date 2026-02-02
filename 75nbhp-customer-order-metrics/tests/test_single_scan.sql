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
    'COMPLETED',
    100.00,
    NOW() - (i || ' days')::INTERVAL
FROM generate_series(1, 1000) i;

CREATE INDEX idx_orders_cust_date ON orders(customer_id, created_at);
ANALYZE orders;


SELECT pg_stat_reset_single_table_counters('orders'::regclass);


SELECT * FROM get_customer_order_metrics(1, '2020-01-01', '2030-01-01');


DO $$
DECLARE
    v_scans BIGINT;
BEGIN
    SELECT seq_scan + idx_scan INTO v_scans
    FROM pg_stat_user_tables
    WHERE relname = 'orders';


    IF v_scans > 1 THEN
        RAISE EXCEPTION 'Multiple scans detected! Count: %. The function must scan the table exactly once.', v_scans;
    ELSIF v_scans = 0 THEN

         RAISE NOTICE '0 scans reported. Check stats update delay.';
    END IF;
    
END$$;
