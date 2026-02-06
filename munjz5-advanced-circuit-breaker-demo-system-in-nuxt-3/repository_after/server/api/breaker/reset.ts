// Reset breaker endpoint

import { resetBreaker, resetAllBreakers, getBreakerStatus } from '../../utils/circuit-breaker';

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}));
  const serviceKey = body.serviceKey as string | undefined;

  if (serviceKey) {
    resetBreaker(serviceKey);
    return {
      message: `Breaker for '${serviceKey}' has been reset`,
      status: getBreakerStatus(serviceKey)
    };
  }

  resetAllBreakers();
  return {
    message: 'All breakers have been reset'
  };
});
