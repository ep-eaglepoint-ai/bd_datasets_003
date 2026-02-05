import { PoolClient } from "pg";
import { validateCard } from "./validateCard";
import { chargeCard, refund } from "./chargeCard";
import { updateInventory } from "./updateInventory";
import { sendReceipt, closeTransporter } from "./sendReceipt";
import { withTransaction, closePool } from "./db";
import {
  Order,
  OrderItem,
  PaymentSuccessResponse,
  PaymentCallback,
  ChargeResult,
  TransactionRecord,
} from "./types";
import { AppError, ErrorCodes } from "./utils/AppError";
import { retry } from "./utils/retry";

// --- Helper Functions ---

async function checkInventory(
  client: PoolClient,
  items: OrderItem[],
): Promise<boolean> {
  const results = await Promise.all(
    items.map(async (item) => {
      const res = await client.query(
        "SELECT quantity FROM inventory WHERE product_id = $1 FOR UPDATE",
        [item.productId],
      );

      if (res.rowCount === 0 || res.rows[0].quantity < item.quantity) {
        return false;
      }
      return true;
    }),
  );

  return results.every((r) => r === true);
}

async function recordTransaction(
  client: PoolClient,
  order: Order,
  chargeResult: ChargeResult,
): Promise<TransactionRecord> {
  const res = await client.query(
    "INSERT INTO transactions (order_id, charge_id, amount, status, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id, created_at",
    [order.id, chargeResult.chargeId, order.total, "completed"],
  );

  if (res.rowCount === 0) {
    throw new AppError("Failed to record transaction", ErrorCodes.DB_ERROR);
  }

  const row = res.rows[0];
  return {
    id: row.id,
    chargeId: chargeResult.chargeId,
    amount: order.total,
    currency: "USD",
    status: "completed",
    created_at: row.created_at,
  };
}

async function refundCharge(chargeId: string): Promise<void> {
  try {
    await retry(() => refund(chargeId), {
      maxRetries: 3,
      initialDelay: 1000,
      multiplier: 2, // Exponential backoff
    });
  } catch (err) {
    console.error("Refund failed after retries", err);
    // Wrap and throw to ensure the caller knows refund failed
    // Casting err to Error to satisfy strict type if unknown
    const error = err instanceof Error ? err : new Error(String(err));
    throw new AppError("Refund failed", ErrorCodes.CHARGE_FAILED, error);
  }
}

// --- Main Async Implementation ---

// Internal type for passing data between transaction and receipt logic
interface InternalPaymentResult extends PaymentSuccessResponse {
  _txRecord: TransactionRecord;
}

const activeOperations = new Set<Promise<unknown>>();
let isShuttingDown = false;


export async function processPaymentAsync(
  order: Order,
): Promise<PaymentSuccessResponse> {
  if (isShuttingDown) {
    throw new AppError("System is shutting down", ErrorCodes.UNKNOWN_ERROR);
  }

  const opPromise = (async (): Promise<InternalPaymentResult> => {
    // 1. Validate
    const isValid = await validateCard(order.card);
    if (!isValid) {
      throw new AppError("Invalid card", ErrorCodes.INVALID_CARD);
    }

    // Prepare result container
    let txRecord: TransactionRecord | undefined;
    let chargeResult: ChargeResult | undefined;

    // 2. Transaction
    await withTransaction(async (client) => {
      // 3. Check Inventory
      const available = await checkInventory(client, order.items);
      if (!available) {
        throw new AppError(
          "Insufficient inventory",
          ErrorCodes.INSUFFICIENT_INVENTORY,
        );
      }

      // 4. Charge Card (External)
      try {
        chargeResult = await chargeCard(order.card, order.total);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        throw new AppError("Charge failed", ErrorCodes.CHARGE_FAILED, error);
      }

      // 5. Update Inventory
      try {
        await updateInventory(client, order.items);
      } catch (err) {
        // Charge succeeded, inventory failed. Must REFUND.
        if (chargeResult) {
            try {
                await refundCharge(chargeResult.chargeId);
            } catch (refundErr) {
                 const rErr = refundErr instanceof Error ? refundErr : new Error(String(refundErr));
                 throw new AppError("Refund failed after inventory error", ErrorCodes.CHARGE_FAILED, rErr);
            }
        }
        const error = err instanceof Error ? err : new Error(String(err));
        throw new AppError("Failed to update inventory", ErrorCodes.DB_ERROR, error);
      }

      // 6. Record Transaction
      try {
        txRecord = await recordTransaction(client, order, chargeResult);
      } catch (err) {
        if (chargeResult) {
            try {
              await refundCharge(chargeResult.chargeId);
            } catch (refundErr) {
               const rErr = refundErr instanceof Error ? refundErr : new Error(String(refundErr));
               throw new AppError("Refund failed after DB error", ErrorCodes.CHARGE_FAILED, rErr);
            }
        }
        const error = err instanceof Error ? err : new Error(String(err));
        throw new AppError("Failed to record transaction", ErrorCodes.DB_ERROR, error);
      }
    });

    if (!txRecord || !chargeResult) {
        throw new AppError("Transaction failed silently", ErrorCodes.TRANSACTION_ERROR);
    }

    const result: PaymentSuccessResponse = {
      success: true,
      transactionId: txRecord.id,
      chargeId: chargeResult.chargeId,
    };
    
    // Return result with hidden txRecord for receipt handling outside transaction
    return { ...result, _txRecord: txRecord }; 
  })();

  activeOperations.add(opPromise);
  // Use void correctly to prevent floating promise lint error
  void opPromise
    .finally(() => activeOperations.delete(opPromise))
    .catch(() => {});

  try {
    const rawRes = await opPromise;
    const txRecord = rawRes._txRecord;
    
    // 8. Send Receipt (Outside transaction)
    sendReceipt(
      order.email, 
      txRecord,
    ).catch((err) => {
      console.log("Receipt failed but payment succeeded", err);
    });

    // Strip private field safely
    const cleanRes: PaymentSuccessResponse = {
        success: rawRes.success,
        transactionId: rawRes.transactionId,
        chargeId: rawRes.chargeId
    };
    return cleanRes;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const error = err instanceof Error ? err : new Error(String(err));
    throw new AppError("Payment processing failed", ErrorCodes.UNKNOWN_ERROR, error);
  }
}

// Legacy Wrapper
function processPayment(order: Order, callback: PaymentCallback): void {
  processPaymentAsync(order)
    .then((res) => callback(null, res))
    .catch((err) => {
        // Ensure error is strictly Error type
        const error = err instanceof Error ? err : new Error(String(err));
        callback(error);
    });
}

export default processPayment;

// Graceful Shutdown
process.once("SIGTERM", async () => {
  isShuttingDown = true;
  const timeout = new Promise((resolve) => setTimeout(resolve, 30000));
  const allOps = Promise.all(Array.from(activeOperations));
  await Promise.race([allOps, timeout]);
  await closePool();
  closeTransporter();
  process.exit(0);
});
