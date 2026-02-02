import { defineConfig } from 'vite'
import path from "node:path";
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(() => {
  // mfqtgd-trustpay-p2p-settlement-engine/
  const repoRoot = path.resolve(__dirname, "../..");
  const isVitest = !!process.env.VITEST;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": "http://localhost:3001",
        "/health": "http://localhost:3001",
      },
      // Allow vitest to load test files from the repo root `tests/` directory on Windows.
      ...(isVitest
        ? {
            fs: {
              strict: false,
              allow: [repoRoot],
            },
          }
        : {}),
    },
    test: {
      // Keep all test files in the dataset root `tests/` folder.
      environment: "jsdom",
      setupFiles: [path.resolve(__dirname, "./src/test/setup.ts")],
      // Run tests located in the repo root `tests/` folder, while still resolving deps from this package.
      include: ["../../tests/**/*.test.{ts,tsx}"],
    },
  };
});
