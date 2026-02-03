// Breaker status endpoint
// Returns breaker states for all service keys plus recent event history

import { getAllBreakerStatuses, getBreakerStatus, getServiceKeys, getRecentEvents } from '../../utils/circuit-breaker';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const serviceKey = query.serviceKey as string | undefined;
  const eventLimit = Math.min(Number(query.eventLimit) || 100, 500);
  const eventSeconds = Math.min(Number(query.eventSeconds) || 300, 3600);

  if (serviceKey) {
    const status = getBreakerStatus(serviceKey);
    if (!status) {
      throw createError({
        statusCode: 404,
        message: `Service key '${serviceKey}' not found`
      });
    }

    return {
      serviceKey,
      status,
      events: getRecentEvents(eventSeconds, serviceKey).slice(-eventLimit)
    };
  }

  return {
    serviceKeys: getServiceKeys(),
    breakers: getAllBreakerStatuses(),
    events: getRecentEvents(eventSeconds).slice(-eventLimit),
    timestamp: Date.now()
  };
});
