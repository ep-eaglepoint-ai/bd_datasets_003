// Fast upstream service - always succeeds quickly
// Always responds quickly with success

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const delay = Math.min(Number(query.delay) || 50, 200); // Max 200ms delay

  await new Promise(resolve => setTimeout(resolve, delay));

  return {
    service: 'fast',
    status: 'success',
    message: 'Fast service responded successfully',
    timestamp: Date.now(),
    delay
  };
});
