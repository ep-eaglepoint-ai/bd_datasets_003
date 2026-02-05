import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";

beforeAll(() => {
  // JSDOM may not provide randomUUID.
  if (!(globalThis as any).crypto) (globalThis as any).crypto = {};
  if (!(globalThis as any).crypto.randomUUID) {
    (globalThis as any).crypto.randomUUID = () => `uuid-${Date.now()}`;
  }

  // Stub audio playback.
  // JSDOM defines play(), but it throws "Not implemented" and logs an error.
  // Keep tests deterministic and output clean.
  (
    HTMLMediaElement.prototype as unknown as { play: () => Promise<void> }
  ).play = vi.fn(() => Promise.resolve());
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
