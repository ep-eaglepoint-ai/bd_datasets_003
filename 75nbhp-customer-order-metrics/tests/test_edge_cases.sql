DROP TABLE IF EXISTS orders CASCADE;

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id BIGINT,
    status TEXT,
    total_price NUMERIC,
    created_at TIMESTAMP
);

DO $$
DECLARE
    result RECORD;
BEGIN

    SELECT * INTO result FROM get_customer_order_metrics(999, '2023-01-01', '2023-12-31');
    
    IF result.total_orders IS DISTINCT FROM 0 OR
       result.completed_orders IS DISTINCT FROM 0 OR
       result.cancelled_orders IS DISTINCT FROM 0 OR
       result.total_revenue IS DISTINCT FROM 0 THEN
        RAISE EXCEPTION 'Zero orders failed. Got %', result;
    END IF;

    INSERT INTO orders (customer_id, status, total_price, created_at) VALUES
    (1, 'COMPLETED', NULL, '2023-01-01 10:00:00'),
    (1, 'COMPLETED', 100.00, '2023-01-01 11:00:00');
    
    SELECT * INTO result FROM get_customer_order_metrics(1, '2023-01-01', '2023-01-02');
    
    IF result.total_orders <> 2 OR result.completed_orders <> 2 OR result.total_revenue <> 0 THEN
        RAISE EXCEPTION 'NULL poisoning failed. Expected revenue=0 due to NULL, got %', result;
    END IF;

    TRUNCATE orders;
    INSERT INTO orders (customer_id, status, total_price, created_at) VALUES
    (2, 'UNKNOWN_STATUS', 50.00, '2023-01-01 10:00:00'),
    (2, 'COMPLETED', 100.00, '2023-01-01 11:00:00');
    
    SELECT * INTO result FROM get_customer_order_metrics(2, '2023-01-01', '2023-01-02');
    
    IF result.total_orders <> 2 THEN
        RAISE EXCEPTION 'Unexpected status failed to count towards total orders. Got %', result;
    END IF;
    
    IF result.completed_orders <> 1 OR result.cancelled_orders <> 0 OR result.total_revenue <> 100.00 THEN
        RAISE EXCEPTION 'Unexpected status metrics incorrect. Got %', result;
    END IF;

    TRUNCATE orders;
    INSERT INTO orders (customer_id, status, total_price, created_at)
    SELECT 
        3, 
        CASE WHEN i % 3 = 0 THEN 'COMPLETED' 
             WHEN i % 3 = 1 THEN 'CANCELLED' 
             ELSE 'PENDING' END,
        CASE WHEN i % 3 = 0 THEN 10.00 ELSE 0 END,
        '2023-06-01'::TIMESTAMP + (i % 30 || ' days')::INTERVAL
    FROM generate_series(1, 10000) i;
    
    SELECT * INTO result FROM get_customer_order_metrics(3, '2023-01-01', '2023-12-31');
    
    IF result.total_orders <> 10000 THEN
        RAISE EXCEPTION 'Large dataset: total_orders incorrect. Got %', result;
    END IF;
    
    IF result.completed_orders <> 3333 OR result.cancelled_orders <> 3334 THEN
        RAISE EXCEPTION 'Large dataset: status counts incorrect. Got %', result;
    END IF;
    
    IF result.total_revenue <> 33330.00 THEN
        RAISE EXCEPTION 'Large dataset: revenue incorrect. Got %', result;
    END IF;

END$$;
