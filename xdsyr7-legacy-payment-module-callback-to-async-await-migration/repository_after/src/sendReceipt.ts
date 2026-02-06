import nodemailer from "nodemailer";
import { TransactionRecord } from "./types";
import { AppError, ErrorCodes } from "./utils/AppError";
import { retry } from "./utils/retry";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
});

function generateReceiptHtml(transaction: TransactionRecord): string {
  return (
    "<h1>Receipt</h1>" +
    "<p>Transaction ID: " +
    transaction.id +
    "</p>" +
    "<p>Amount: $" +
    (transaction.amount / 100).toFixed(2) +
    "</p>" +
    "<p>Date: " +
    transaction.created_at +
    "</p>"
  ); // formatted date might differ if generic toString
}

async function sendMailInternal(
  email: string,
  transaction: TransactionRecord,
): Promise<any> {
  try {
    return await transporter.sendMail({
      from: "noreply@shop.com",
      to: email,
      subject: "Your Receipt #" + transaction.id,
      html: generateReceiptHtml(transaction),
    });
  } catch (err: any) {
    throw new AppError("Email failed", ErrorCodes.EMAIL_FAILED, err);
  }
}

export async function sendReceipt(
  email: string,
  transaction: TransactionRecord,
): Promise<any> {
  // Legacy: 1000 * 2^retries. Retries starts at 1 (after increment). So 2000, 4000, 8000?
  // Code: retries++ (becomes 1). pow(2, 1) = 2. 1000*2 = 2000.
  // Next: retries++ (becomes 2). pow(2, 2) = 4. 1000*4 = 4000.
  // Next: retries++ (becomes 3). 3 < 3 false.
  // So delays: 2000, 4000. 2 retries handled? Or 3?
  // maxRetries = 3.
  // 1 (failed) -> wait 2000 -> 2 (failed) -> wait 4000 -> 3 (failed) -> stop.
  // My retry util: maxRetries 3.
  // 1 (failed) -> wait initial -> 2 ...
  // So initialDelay=2000, multiplier=2 matches closely.

  return retry(() => sendMailInternal(email, transaction), {
    maxRetries: 3,
    initialDelay: 2000,
    multiplier: 2,
  });
}

export function closeTransporter() {
  transporter.close();
}
