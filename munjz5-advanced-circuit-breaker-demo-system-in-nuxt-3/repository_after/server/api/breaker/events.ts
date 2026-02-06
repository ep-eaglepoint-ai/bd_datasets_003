// Events endpoint
// Returns recent events from the event log

import { getRecentEvents } from '../../utils/circuit-breaker';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const serviceKey = query.serviceKey as string | undefined;
  const limit = Math.min(Number(query.limit) || 100, 500);
  const seconds = Math.min(Number(query.seconds) || 60, 3600);

  const events = getRecentEvents(seconds, serviceKey);

  return {
    events: events.slice(-limit),
    total: events.length,
    serviceKey: serviceKey || 'all',
    timeRange: `${seconds}s`
  };
});
