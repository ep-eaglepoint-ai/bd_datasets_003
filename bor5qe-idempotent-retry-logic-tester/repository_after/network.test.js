import { jest, describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { pathToFileURL } from "url";
import path from "path";


describe("fetchWithRetry", () => {
  const url = "https://payments.example.com/charge";
  const options = {
    method: "POST",
    headers: { "Idempotency-Key": "abc-123" },
    body: JSON.stringify({ amount: 100 }),
  };

  let fetchWithRetry;
  beforeEach(async () => {
    const implPath = process.env.IMPL_PATH;
    if (!implPath) {
      throw new Error("IMPL_PATH environment variable not set");
    }

    const absolutePath = implPath.startsWith("/") ? implPath : path.resolve(implPath);
    
    // 2. Convert that path string to a file:// URL string
    const moduleUrlString = pathToFileURL(absolutePath).href;

    // 3. Import the module once using the URL + cache buster
    // Note: We destructure { fetchWithRetry } directly from the namespace object
    const module = await import(`${moduleUrlString}?update=${Date.now()}`);
    fetchWithRetry = module.fetchWithRetry;
  })

// Helper to mock fetch 
  function mockFetchSequence(sequence) {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        typeof sequence[0] === "function"
          ? sequence.shift()()
          : sequence.shift()
      )
    );
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(global, "setTimeout");
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    delete global.fetch;
  });

  test("Backoff: retries with exponential delays (300 → 600 → 1200)", async () => {
    mockFetchSequence([
      { ok: false, status: 503 },
      { ok: false, status: 503 },
      { ok: false, status: 503 },
      { ok: true, json: async () => ({ success: true }) },
    ]);

    const promise = fetchWithRetry(url, options, 3, 300);

    await jest.runOnlyPendingTimersAsync();
    await jest.runOnlyPendingTimersAsync();
    await jest.runOnlyPendingTimersAsync();

    const result = await promise;

    expect(result).toEqual({ success: true });

    const delays = setTimeout.mock.calls.map(call => call[1]);
    expect(delays).toEqual([300, 600, 1200]);

    expect(fetch).toHaveBeenCalledTimes(4);

    fetch.mock.calls.forEach(([calledUrl, calledOptions]) => {
      expect(calledUrl).toBe(url);
      expect(calledOptions).toEqual(options);
    });
  });

  test("Idempotency: 400 error throws immediately with no retries", async () => {
    mockFetchSequence([
      { ok: false, status: 400 },
    ]);

    await expect(
      fetchWithRetry(url, options, 3, 300)
    ).rejects.toThrow("Request failed: 400");

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(setTimeout).not.toHaveBeenCalled();
  });

  test("Success: first call succeeds with no retries", async () => {
    mockFetchSequence([
      { ok: true, json: async () => ({ charged: true }) },
    ]);

    const result = await fetchWithRetry(url, options);

    expect(result).toEqual({ charged: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(setTimeout).not.toHaveBeenCalled();
  });

  test("Max retries: stops after maxRetries + 1 attempts and throws", async () => {
    mockFetchSequence([
      { ok: false, status: 500 },
      { ok: false, status: 500 },
      { ok: false, status: 500 },
      { ok: false, status: 500 },
    ]);

    const expectation = expect(
        fetchWithRetry(url, options, 3, 300)
    ).rejects.toThrow("Request failed: 500");

    await jest.runAllTimersAsync();

    await expectation;
    // Initial call + 3 retries
    expect(fetch).toHaveBeenCalledTimes(4);

    const delays = setTimeout.mock.calls.map(call => call[1]);
    expect(delays).toEqual([300, 600, 1200]);

    fetch.mock.calls.forEach(([calledUrl, calledOptions]) => {
      expect(calledUrl).toBe(url);
      expect(calledOptions).toEqual(options);
    });
  });
});
