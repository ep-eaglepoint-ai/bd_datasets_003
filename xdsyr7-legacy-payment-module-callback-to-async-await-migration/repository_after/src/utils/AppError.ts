export class AppError extends Error {
  public readonly code: string;
  public readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.cause = cause;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }

    // If there's a cause, append its stack
    if (cause && cause.stack) {
      this.stack += `\nCaused by: ${cause.stack}`;
    }
  }
}

export enum ErrorCodes {
  INVALID_CARD = "INVALID_CARD",
  CHARGE_FAILED = "CHARGE_FAILED",
  INSUFFICIENT_INVENTORY = "INSUFFICIENT_INVENTORY",
  DB_ERROR = "DB_ERROR",
  PAYMENT_GATEWAY_TIMEOUT = "PAYMENT_GATEWAY_TIMEOUT",
  EMAIL_FAILED = "EMAIL_FAILED",
  TRANSACTION_ERROR = "TRANSACTION_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}
