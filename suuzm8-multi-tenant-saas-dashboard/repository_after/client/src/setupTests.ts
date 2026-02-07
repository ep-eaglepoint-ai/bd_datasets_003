import "@testing-library/jest-dom/vitest";

import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";

const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.warn = (...args: unknown[]) => {
    const msg = args.map((a) => String(a)).join(" ");
    if (msg.includes("React Router Future Flag Warning")) return;
    originalConsoleWarn(...args);
  };
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  console.warn = originalConsoleWarn;
});
