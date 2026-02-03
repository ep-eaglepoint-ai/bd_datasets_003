// Slow upstream service - configurable delay for timeout testing
// Has configurable delay that can exceed timeout

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const delay = Math.min(Number(query.delay) || 10000, 30000); // Default 10s, max 30s

  await new Promise(resolve => setTimeout(resolve, delay));

  return {
    service: 'slow',
    status: 'success',
    message: 'Slow service responded (eventually)',
    timestamp: Date.now(),
    delay
  };
});
