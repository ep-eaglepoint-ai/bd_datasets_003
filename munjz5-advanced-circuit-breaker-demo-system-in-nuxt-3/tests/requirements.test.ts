/**
 * Circuit Breaker Requirements Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn, ChildProcess } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_PATH = join(__dirname, "..", "repository_after");

let serverProcess: ChildProcess | null = null;
let baseUrl = "http://localhost:3000";

async function waitForServer(url: string, timeout = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`${url}/api/breaker/status`);
      if (response.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    serverProcess = spawn("npx", ["nuxt", "dev", "--port", "3000"], {
      cwd: REPO_PATH,
      shell: true,
      stdio: "pipe",
    });

    serverProcess.stdout?.on("data", (data) => {
      const output = data.toString();
      if (output.includes("Local:") || output.includes("ready")) {
        resolve();
      }
    });

    serverProcess.stderr?.on("data", (data) => {
      console.error(`Server stderr: ${data}`);
    });

    serverProcess.on("error", reject);

    // Timeout for server start
    setTimeout(() => resolve(), 15000);
  });
}

async function stopServer(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function resetBreakers(): Promise<void> {
  try {
    await fetch(`${baseUrl}/api/breaker/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    // Ignore errors during reset
  }
}

async function makeRequest(
  service: string,
  params: Record<string, string | number> = {},
): Promise<any> {
  const searchParams = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );
  const response = await fetch(
    `${baseUrl}/api/services/${service}?${searchParams}`,
  );
  return response.json();
}

describe("Circuit Breaker Requirements Tests", () => {
  beforeEach(async () => {
    await resetBreakers();
  });

  // The system uses Nuxt 3 server routes as the only integration point for external service calls
  describe("Nuxt 3 Server Routes Integration", () => {
    it("should use Nuxt 3 server routes for service calls", async () => {
      const response = await fetch(`${baseUrl}/api/services/fast`);
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toHaveProperty("serviceKey");
      expect(data.serviceKey).toMatch(/^upstream-/);
    });

    it("should have server-side circuit breaker implementation", async () => {
      const response = await fetch(`${baseUrl}/api/breaker/status`);
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toHaveProperty("breakers");
    });
  });

  // The circuit breaker supports three states: CLOSED, OPEN, and HALF_OPEN
  describe("Three States Support", () => {
    it("should start in CLOSED state", async () => {
      const result = await makeRequest("fast");
      expect(result.stats.state).toBe("CLOSED");
    });

    it("should transition to OPEN state after failures", async () => {
      // Make requests to flaky service with 100% failure rate
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", { failureRate: 100, failureThreshold: 5 });
      }
      const result = await makeRequest("flaky", { failureRate: 100 });
      expect(["OPEN", "HALF_OPEN"]).toContain(result.stats.state);
    });

    it("should transition to HALF_OPEN after reset timeout", async () => {
      // Force circuit to OPEN
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", {
          failureRate: 100,
          failureThreshold: 3,
          resetTimeout: 1000,
        });
      }

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 1500));

      const result = await makeRequest("flaky", {
        failureRate: 0,
        resetTimeout: 1000,
      });
      // State could be HALF_OPEN or CLOSED if probe succeeded
      expect(["HALF_OPEN", "CLOSED"]).toContain(result.stats.state);
    });
  });

  // The breaker transitions from CLOSED to OPEN when the configured failure threshold is exceeded
  describe("CLOSED to OPEN Transition", () => {
    it("should transition to OPEN when failure threshold exceeded", async () => {
      const config = {
        failureRate: 100,
        failureThreshold: 3,
      };

      // Make enough failed requests to exceed threshold
      for (let i = 0; i < 5; i++) {
        await makeRequest("flaky", config);
      }

      const statusResponse = await fetch(
        `${baseUrl}/api/breaker/status?serviceKey=upstream-flaky`,
      );
      const status = await statusResponse.json();
      expect(status.status.state).toBe("OPEN");
    });
  });

  // The breaker transitions from OPEN to HALF_OPEN only after the configured reset interval elapses
  describe("OPEN to HALF_OPEN Transition", () => {
    it("should stay OPEN before reset timeout", async () => {
      // Force to OPEN
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", {
          failureRate: 100,
          failureThreshold: 3,
          resetTimeout: 30000,
        });
      }

      const result = await makeRequest("flaky", { resetTimeout: 30000 });
      expect(result.stats.state).toBe("OPEN");
      expect(result.fallbackUsed).toBe(true);
    });

    it("should transition to HALF_OPEN after reset timeout", async () => {
      // Force to OPEN with short reset timeout
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", {
          failureRate: 100,
          failureThreshold: 3,
          resetTimeout: 1000,
        });
      }

      await new Promise((r) => setTimeout(r, 1500));

      const result = await makeRequest("flaky", {
        failureRate: 0,
        resetTimeout: 1000,
      });
      expect(["HALF_OPEN", "CLOSED"]).toContain(result.stats.state);
    });
  });

  // The breaker transitions from HALF_OPEN to CLOSED after the required number of successful probe requests
  describe("HALF_OPEN to CLOSED Transition", () => {
    it("should transition to CLOSED after successful probes", async () => {
      const config = {
        failureRate: 100,
        failureThreshold: 3,
        resetTimeout: 500,
        successThreshold: 2,
      };

      // Force to OPEN
      for (let i = 0; i < 5; i++) {
        await makeRequest("flaky", config);
      }

      await new Promise((r) => setTimeout(r, 700));

      // Now make successful requests (0% failure rate)
      for (let i = 0; i < 5; i++) {
        await makeRequest("flaky", { ...config, failureRate: 0 });
      }

      const statusResponse = await fetch(
        `${baseUrl}/api/breaker/status?serviceKey=upstream-flaky`,
      );
      const status = await statusResponse.json();
      expect(status.status.state).toBe("CLOSED");
    });
  });

  // The breaker immediately blocks upstream calls when in the OPEN state
  describe("Immediate Blocking in OPEN State", () => {
    it("should block requests and return quickly when OPEN", async () => {
      // Force to OPEN
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", {
          failureRate: 100,
          failureThreshold: 3,
          resetTimeout: 30000,
        });
      }

      const start = Date.now();
      const result = await makeRequest("slow", {
        delay: 5000,
        resetTimeout: 30000,
      });
      const duration = Date.now() - start;

      expect(result.fallbackUsed).toBe(true);
      expect(result.fallbackReason).toBe("OPEN");
      // Should respond quickly (< 100ms) even though slow service has 5s delay
      expect(duration).toBeLessThan(200);
    });
  });

  // The system returns a fallback response without calling the upstream service when the circuit is OPEN
  describe("Fallback Response in OPEN State", () => {
    it("should return fallback when circuit is OPEN", async () => {
      // Force to OPEN
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", { failureRate: 100, failureThreshold: 3 });
      }

      const result = await makeRequest("flaky", { failureRate: 0 });
      expect(result.fallbackUsed).toBe(true);
      expect(result.data).not.toBeNull();
    });
  });

  // Request failures and timeouts are tracked using metrics
  describe("Metrics Tracking", () => {
    it("should track metrics", async () => {
      await makeRequest("fast");
      await makeRequest("flaky", { failureRate: 100 });

      const statusResponse = await fetch(
        `${baseUrl}/api/breaker/status?serviceKey=upstream-fast`,
      );
      const status = await statusResponse.json();

      expect(status.status.metrics).toHaveProperty("totalSuccesses");
      expect(status.status.metrics).toHaveProperty("totalFailures");
      expect(status.status.metrics).toHaveProperty("totalTimeouts");
      expect(status.status.metrics).toHaveProperty("failureRate");
      expect(status.status.metrics).toHaveProperty("totalRequests");
    });
  });

  // Upstream request timeouts are enforced and classified separately from other failures
  describe("Timeout Enforcement and Classification", () => {
    it("should enforce timeout and classify as TIMEOUT", async () => {
      const result = await makeRequest("slow", { delay: 10000, timeout: 500 });

      expect(result.stats.metrics.totalTimeouts).toBeGreaterThan(0);
      if (result.fallbackUsed) {
        expect(result.fallbackReason).toBe("TIMEOUT");
      }
    });

    it("should track timeouts separately from failures", async () => {
      await makeRequest("slow", { delay: 10000, timeout: 500 });
      await makeRequest("flaky", { failureRate: 100 });

      const slowStatus = await fetch(
        `${baseUrl}/api/breaker/status?serviceKey=upstream-slow`,
      );
      const slowData = await slowStatus.json();

      const flakyStatus = await fetch(
        `${baseUrl}/api/breaker/status?serviceKey=upstream-flaky`,
      );
      const flakyData = await flakyStatus.json();

      expect(slowData.status.metrics.totalTimeouts).toBeGreaterThan(0);
      expect(flakyData.status.metrics.totalFailures).toBeGreaterThan(0);
    });
  });

  // Automatic retries are disabled for calls protected by the circuit breaker
  describe("No Automatic Retries", () => {
    it("should not retry automatically by default", async () => {
      const start = Date.now();
      await makeRequest("flaky", { failureRate: 100, timeout: 1000 });
      const duration = Date.now() - start;

      // If retrying, would take longer than timeout * retries
      // Single request should complete within timeout + small buffer
      expect(duration).toBeLessThan(2000);
    });
  });

  // The breaker state and runtime statistics are returned in the API response
  describe("State and Stats in Response", () => {
    it("should include breaker state in response", async () => {
      const result = await makeRequest("fast");

      expect(result).toHaveProperty("stats");
      expect(result.stats).toHaveProperty("state");
      expect(["CLOSED", "OPEN", "HALF_OPEN"]).toContain(result.stats.state);
    });

    it("should include runtime statistics in response", async () => {
      const result = await makeRequest("fast");

      expect(result.stats).toHaveProperty("metrics");
      expect(result.stats).toHaveProperty("lastStateChange");
      expect(result.stats).toHaveProperty("consecutiveSuccesses");
      expect(result.stats).toHaveProperty("currentInFlight");
      expect(result.stats).toHaveProperty("config");
    });
  });

  // Multiple simulated upstream services with different failure behaviors are available
  describe("Multiple Simulated Services", () => {
    it("should have fast service that succeeds quickly", async () => {
      const start = Date.now();
      const result = await makeRequest("fast");
      const duration = Date.now() - start;

      expect(result.data.service).toBe("fast");
      expect(result.data.status).toBe("success");
      expect(duration).toBeLessThan(500);
    });

    it("should have flaky service with configurable failure rate", async () => {
      // Test with 100% failure rate
      const failResult = await makeRequest("flaky", { failureRate: 100 });
      expect(failResult.error || failResult.fallbackUsed).toBeTruthy();

      await resetBreakers();

      // Test with 0% failure rate
      const successResult = await makeRequest("flaky", { failureRate: 0 });
      expect(successResult.data.service).toBe("flaky");
      expect(successResult.data.status).toBe("success");
    });

    it("should have slow service with configurable delay", async () => {
      const result = await makeRequest("slow", { delay: 100, timeout: 5000 });
      expect(result.data.service).toBe("slow");
      expect(result.data.delay).toBe(100);
    });
  });

  // Circuit breaker state changes are logged on the server
  describe("Server-Side Logging", () => {
    it("should log state changes in events", async () => {
      // Force state change
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", { failureRate: 100, failureThreshold: 3 });
      }

      const eventsResponse = await fetch(
        `${baseUrl}/api/breaker/events?seconds=60`,
      );
      const eventsData = await eventsResponse.json();

      const stateChangeEvents = eventsData.events.filter(
        (e: any) => e.eventType === "STATE_CHANGE",
      );

      expect(stateChangeEvents.length).toBeGreaterThan(0);
    });

    it("should have structured event logging", async () => {
      await makeRequest("fast");

      const eventsResponse = await fetch(
        `${baseUrl}/api/breaker/events?seconds=60`,
      );
      const eventsData = await eventsResponse.json();

      expect(eventsData.events.length).toBeGreaterThan(0);
      const event = eventsData.events[0];
      expect(event).toHaveProperty("timestamp");
      expect(event).toHaveProperty("serviceKey");
      expect(event).toHaveProperty("eventType");
      expect(event).toHaveProperty("details");
    });
  });

  // A Nuxt 3 UI page allows users to trigger requests and observe state transitions
  describe("UI Dashboard", () => {
    it("should serve UI dashboard page", async () => {
      const response = await fetch(baseUrl);
      expect(response.ok).toBe(true);
      const html = await response.text();
      expect(html).toContain("Circuit Breaker");
    });

    it("should have interactive elements for triggering requests", async () => {
      const response = await fetch(baseUrl);
      const html = await response.text();

      // Check for key UI elements
      expect(html.toLowerCase()).toContain("service");
      expect(html.toLowerCase()).toContain("state");
    });
  });
});

// Export test function for external runner
export async function runTests(): Promise<{
  passed: number;
  failed: number;
  results: any[];
}> {
  const results: any[] = [];
  let passed = 0;
  let failed = 0;

  // This will be implemented by the test runner
  return { passed, failed, results };
}
