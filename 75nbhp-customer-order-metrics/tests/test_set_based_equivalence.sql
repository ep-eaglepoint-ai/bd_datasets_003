DROP TABLE IF EXISTS orders CASCADE;

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id BIGINT,
    status TEXT,
    total_price NUMERIC,
    created_at TIMESTAMP
);

INSERT INTO orders (customer_id, status, total_price, created_at) VALUES
    (1, 'COMPLETED', 100.00, '2023-01-05 10:00:00'),
    (1, 'COMPLETED', 50.00, '2023-01-15 12:00:00'),
    (1, 'CANCELLED', 200.00, '2023-01-10 14:00:00'),
    (1, 'PENDING', 75.00, '2023-01-20 09:00:00'),
    (1, 'COMPLETED', 100.00, '2022-12-31 23:59:59'),
    (1, 'COMPLETED', 100.00, '2023-02-01 00:00:01'), 
    (2, 'COMPLETED', 500.00, '2023-01-10 10:00:00'); 

DO $$
DECLARE
    result RECORD;
BEGIN
    SELECT * INTO result FROM get_customer_order_metrics(1, '2023-01-01', '2023-01-31');

    IF result.total_orders <> 4 THEN
        RAISE EXCEPTION 'Expected total_orders=4, got %', result.total_orders;
    END IF;
    
    IF result.completed_orders <> 2 THEN
        RAISE EXCEPTION 'Expected completed_orders=2, got %', result.completed_orders;
    END IF;
    
    IF result.cancelled_orders <> 1 THEN
        RAISE EXCEPTION 'Expected cancelled_orders=1, got %', result.cancelled_orders;
    END IF;
    
    IF result.total_revenue <> 150.00 THEN
        RAISE EXCEPTION 'Expected total_revenue=150.00, got %', result.total_revenue;
    END IF;

    SELECT * INTO result FROM get_customer_order_metrics(999, '2023-01-01', '2023-01-31');
    
    IF result.total_orders <> 0 OR result.completed_orders <> 0 OR 
       result.cancelled_orders <> 0 OR result.total_revenue <> 0 THEN
        RAISE EXCEPTION 'Expected all zeros for non-existent customer, got %', result;
    END IF;

END$$;
