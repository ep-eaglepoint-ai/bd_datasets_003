import { PoolClient } from "pg";
import { OrderItem } from "./types";
import { AppError, ErrorCodes } from "./utils/AppError";

export async function updateInventory(
  connection: PoolClient,
  items: OrderItem[],
): Promise<void> {
  // Use Promise.all to replicate parallel execution behavior of legacy code
  await Promise.all(
    items.map(async (item) => {
      const queryText = `
      UPDATE inventory 
      SET quantity = quantity - $1, updated_at = NOW() 
      WHERE product_id = $2 AND quantity >= $3
    `;

      // In pg, placeholders are $1, $2, etc.
      // item.quantity is used twice: once to subtract, once to check availability
      const params = [item.quantity, item.productId, item.quantity];

      try {
        const result = await connection.query(queryText, params);

        if (result.rowCount === 0) {
          throw new AppError(
            `Insufficient stock for product ${item.productId}`,
            ErrorCodes.INSUFFICIENT_INVENTORY,
          );
        }
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        throw new AppError("Inventory update failed", ErrorCodes.DB_ERROR, err);
      }
    }),
  );
}

export async function restoreInventory(
  connection: PoolClient,
  items: OrderItem[],
): Promise<void> {
  await Promise.all(
    items.map(async (item) => {
      const queryText =
        "UPDATE inventory SET quantity = quantity + $1 WHERE product_id = $2";
      try {
        await connection.query(queryText, [item.quantity, item.productId]);
      } catch (err) {
        console.error(
          "Failed to restore inventory for product",
          item.productId,
          err,
        );
        // Legacy code logs error but callback eventually called.
        // We should probably allow it to proceed or at least not crash everything if one restore fails?
        // Legacy calls callback() when remaining reaches 0. It swallows error effectively (just logging).
      }
    }),
  );
}
