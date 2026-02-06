// Configuration endpoint
// Update breaker configuration at runtime

import { updateBreakerConfig, getBreakerStatus } from '../../utils/circuit-breaker';
import type { BreakerConfig } from '../../utils/circuit-breaker';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const serviceKey = body.serviceKey as string;

  if (!serviceKey) {
    throw createError({
      statusCode: 400,
      message: 'serviceKey is required'
    });
  }

  const config: Partial<BreakerConfig> = {};

  // Extract config fields from body
  const configFields: (keyof BreakerConfig)[] = [
    'failureThreshold',
    'resetTimeout',
    'successThreshold',
    'timeout',
    'minimumRequestVolume',
    'failureRateThreshold'
  ];

  for (const field of configFields) {
    if (body[field] !== undefined) {
      (config as Record<string, unknown>)[field] = body[field];
    }
  }

  // Check if breaker exists
  const currentStatus = getBreakerStatus(serviceKey);
  if (!currentStatus) {
    throw createError({
      statusCode: 404,
      message: `Service key '${serviceKey}' not found. Make a request first to create the breaker.`
    });
  }

  const updatedStatus = updateBreakerConfig(serviceKey, config);

  return {
    message: `Configuration updated for '${serviceKey}'`,
    status: updatedStatus
  };
});
