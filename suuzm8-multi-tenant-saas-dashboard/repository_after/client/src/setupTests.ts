import "@testing-library/jest-dom/vitest";

import { afterAll, beforeAll } from "vitest";

const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.warn = (...args: unknown[]) => {
    const msg = args.map((a) => String(a)).join(" ");
    if (msg.includes("React Router Future Flag Warning")) return;
    originalConsoleWarn(...args);
  };
});

afterAll(() => {
  console.warn = originalConsoleWarn;
});
