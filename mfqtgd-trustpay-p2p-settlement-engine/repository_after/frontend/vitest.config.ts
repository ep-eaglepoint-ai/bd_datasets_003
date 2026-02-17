import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Allow Vitest/Vite to load test files from the repo root `tests/` directory
  // (in Docker this becomes /app/tests/*).
  server: {
    fs: {
      strict: false,
      allow: [path.resolve(__dirname, "../..")],
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "./src/test/setup.ts")],
    // Tests live in the repo root tests/ folder
    include: ["../../tests/**/*.test.{ts,tsx}"],
  },
});

