CREATE OR REPLACE FUNCTION refresh_inventory_status()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    rec_warehouse RECORD;
    rec_stock RECORD;
    rec_product RECORD;
    v_current_stock INTEGER := 0;
    v_temp_stock INTEGER;
BEGIN
    -- Loop through all warehouses
    FOR rec_warehouse IN
        SELECT id FROM warehouses
        ORDER BY id
    LOOP
        -- For each warehouse, loop through all products
        FOR rec_product IN
            SELECT id FROM products
        LOOP
            v_current_stock := 0;

            -- Sum all stock movements for this product in this warehouse
            FOR rec_stock IN
                SELECT quantity, movement_type
                FROM stock_movements
                WHERE warehouse_id = rec_warehouse.id
                  AND product_id = rec_product.id
            LOOP
                IF rec_stock.movement_type = 'IN' THEN
                    v_current_stock := v_current_stock + rec_stock.quantity;
                ELSIF rec_stock.movement_type = 'OUT' THEN
                    v_current_stock := v_current_stock - rec_stock.quantity;
                ELSE
                    -- Unknown movement type, raise a warning (no exception)
                    RAISE WARNING 'Unknown movement_type % for product % in warehouse %', rec_stock.movement_type, rec_product.id, rec_warehouse.id;
                END IF;
            END LOOP;

            -- Update the inventory table with the calculated stock level
            UPDATE inventory
            SET quantity = v_current_stock,
                last_updated = NOW()
            WHERE warehouse_id = rec_warehouse.id
              AND product_id = rec_product.id;

            -- If no rows updated, insert a new record (handle missing inventory row)
            IF NOT FOUND THEN
                INSERT INTO inventory (warehouse_id, product_id, quantity, last_updated)
                VALUES (rec_warehouse.id, rec_product.id, v_current_stock, NOW());
            END IF;
        END LOOP;
    END LOOP;

    -- Simulate delay to mimic heavy processing load
    PERFORM pg_sleep(0.05);

EXCEPTION
    WHEN OTHERS THEN
        -- Minimal error handling: raise exception with message
        RAISE EXCEPTION 'Error refreshing inventory status: %', SQLERRM;
END;
$$;
