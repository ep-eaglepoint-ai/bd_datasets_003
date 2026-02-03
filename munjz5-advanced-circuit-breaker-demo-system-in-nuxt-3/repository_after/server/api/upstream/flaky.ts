// Flaky upstream service - configurable failure rate

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const delay = Math.min(Number(query.delay) || 100, 2000);
  const rawFailureRate = query.failureRate !== undefined ? Number(query.failureRate) : 50;
  const failureRate = Math.min(Math.max(rawFailureRate, 0), 100);

  await new Promise(resolve => setTimeout(resolve, delay));

  // Randomly fail based on failure rate
  if (Math.random() * 100 < failureRate) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: `Flaky service failed (failureRate: ${failureRate}%)`
    });
  }

  return {
    service: 'flaky',
    status: 'success',
    message: 'Flaky service responded successfully',
    timestamp: Date.now(),
    delay,
    failureRate
  };
});
