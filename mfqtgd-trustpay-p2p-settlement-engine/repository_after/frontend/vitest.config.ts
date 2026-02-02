import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "./src/test/setup.ts")],
    // Tests live in the repo root tests/ folder
    include: ["../../tests/**/*.test.{ts,tsx}"],
  },
});

