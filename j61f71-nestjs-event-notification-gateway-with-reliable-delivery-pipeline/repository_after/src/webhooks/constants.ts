export const WEBHOOK_DELIVERY_QUEUE = "webhook-delivery";

export const WEBHOOK_DELIVERY_JOB = "deliver-webhook";

export const WEBHOOK_MAX_ATTEMPTS = 7;
export const WEBHOOK_BASE_DELAY_MS = 60_000;
export const WEBHOOK_JITTER_RATIO = 0.3;

export const CIRCUIT_FAILURE_THRESHOLD = 5;
export const CIRCUIT_COOLDOWN_MS = 60_000;

export const RESPONSE_BODY_PREVIEW_MAX_BYTES = 5 * 1024;
