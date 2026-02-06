import { EventEmitter } from "events";
import { Card, ChargeResult } from "./types";
import { AppError, ErrorCodes } from "./utils/AppError";
import { retry } from "./utils/retry";

const gateway = new EventEmitter();

function simulateGatewayCall(card: Card, amount: number) {
  setTimeout(
    function () {
      if (Math.random() < 0.1) {
        gateway.emit("charge_failed", new Error("Card declined"));
      } else {
        gateway.emit("charge_complete", {
          chargeId: "ch_" + Math.random().toString(36).substr(2, 9),
          amount: amount,
          last4: card.number.slice(-4),
        });
      }
    },
    100 + Math.random() * 200,
  );
}

// Internal function to perform a single charge attempt
function performCharge(card: Card, amount: number): Promise<ChargeResult> {
  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | null = null;

    const onComplete = (result: any) => {
      cleanup();
      resolve(result as ChargeResult);
    };

    const onFail = (error: Error) => {
      cleanup();
      reject(
        new AppError(
          error.message || "Charge failed",
          ErrorCodes.CHARGE_FAILED,
          error,
        ),
      );
    };

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      gateway.removeListener("charge_complete", onComplete);
      gateway.removeListener("charge_failed", onFail);
    };

    gateway.on("charge_complete", onComplete);
    gateway.on("charge_failed", onFail);

    timeoutId = setTimeout(() => {
      cleanup();
      reject(
        new AppError(
          "Payment gateway timeout",
          ErrorCodes.PAYMENT_GATEWAY_TIMEOUT,
        ),
      );
    }, 30000); // 30s timeout as per legacy

    simulateGatewayCall(card, amount);
  });
}

// The exported function with retry logic
export async function chargeCard(
  card: Card,
  amount: number,
): Promise<ChargeResult> {
  return retry(() => performCharge(card, amount), {
    maxRetries: 3,
    initialDelay: 500, // Reasonable default
    multiplier: 2,
  });
}

export async function refund(chargeId: string): Promise<{ refundId: string }> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < 0.05) {
        reject(new AppError("Refund failed", ErrorCodes.CHARGE_FAILED));
      } else {
        resolve({
          refundId: "rf_" + Math.random().toString(36).substr(2, 9),
        });
      }
    }, 50);
  });
}
