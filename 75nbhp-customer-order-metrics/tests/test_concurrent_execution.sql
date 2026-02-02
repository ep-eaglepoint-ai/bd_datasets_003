
\set p_customer_id 1

BEGIN;
    SELECT * FROM get_customer_order_metrics(:p_customer_id, '2023-01-01', '2023-01-31');
COMMIT;
