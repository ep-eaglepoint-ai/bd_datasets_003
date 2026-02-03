// Protected service route - uses circuit breaker for upstream calls

import { executeWithBreaker } from "../../utils/circuit-breaker";
import type { BreakerConfig } from "../../utils/circuit-breaker";

const VALID_SERVICES = ["fast", "flaky", "slow"];

export default defineEventHandler(async (event) => {
  const service = getRouterParam(event, "service");
  const query = getQuery(event);
  const body = event.method === "POST" ? await readBody(event) : {};

  if (!service || !VALID_SERVICES.includes(service)) {
    throw createError({
      statusCode: 400,
      message: `Invalid service. Valid services: ${VALID_SERVICES.join(", ")}`,
    });
  }

  const serviceKey = `upstream-${service}`;

  // Build config from query/body
  const config: Partial<BreakerConfig> = {};
  if (query.failureThreshold || body.failureThreshold) {
    config.failureThreshold = Number(
      query.failureThreshold || body.failureThreshold,
    );
  }
  if (query.resetTimeout || body.resetTimeout) {
    config.resetTimeout = Number(query.resetTimeout || body.resetTimeout);
  }
  if (query.successThreshold || body.successThreshold) {
    config.successThreshold = Number(
      query.successThreshold || body.successThreshold,
    );
  }
  if (query.timeout || body.timeout) {
    config.timeout = Number(query.timeout || body.timeout);
  }
  if (query.minimumRequestVolume || body.minimumRequestVolume) {
    config.minimumRequestVolume = Number(
      query.minimumRequestVolume || body.minimumRequestVolume,
    );
  }
  if (query.failureRateThreshold || body.failureRateThreshold) {
    config.failureRateThreshold = Number(
      query.failureRateThreshold || body.failureRateThreshold,
    );
  }

  // Upstream query params
  const upstreamParams = new URLSearchParams();
  if (query.delay || body.delay) {
    upstreamParams.set("delay", String(query.delay || body.delay));
  }
  if (query.failureRate || body.failureRate) {
    upstreamParams.set(
      "failureRate",
      String(query.failureRate || body.failureRate),
    );
  }

  // Build the upstream URL
  const baseUrl = getRequestURL(event);
  const upstreamUrl = `${baseUrl.protocol}//${baseUrl.host}/api/upstream/${service}?${upstreamParams.toString()}`;

  // Execute with circuit breaker
  const result = await executeWithBreaker(
    serviceKey,
    async (signal: AbortSignal) => {
      const response = await fetch(upstreamUrl, { signal });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    { config },
  );

  return {
    serviceKey,
    ...result,
  };
});
