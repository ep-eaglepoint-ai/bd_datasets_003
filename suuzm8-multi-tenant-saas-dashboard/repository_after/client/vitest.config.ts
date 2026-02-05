import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "/app/repository_after/client",
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^react$/,
        replacement: "/app/repository_after/client/node_modules/react",
      },
      {
        find: /^react\/(.*)$/,
        replacement: "/app/repository_after/client/node_modules/react/$1",
      },
      {
        find: /^react-dom$/,
        replacement: "/app/repository_after/client/node_modules/react-dom",
      },
      {
        find: /^react-dom\/(.*)$/,
        replacement: "/app/repository_after/client/node_modules/react-dom/$1",
      },
      {
        find: /^react-router-dom$/,
        replacement:
          "/app/repository_after/client/node_modules/react-router-dom",
      },
      {
        find: /^react-router-dom\/(.*)$/,
        replacement:
          "/app/repository_after/client/node_modules/react-router-dom/$1",
      },
      {
        find: /^@tanstack\/react-query$/,
        replacement:
          "/app/repository_after/client/node_modules/@tanstack/react-query",
      },
      {
        find: /^@tanstack\/react-query\/(.*)$/,
        replacement:
          "/app/repository_after/client/node_modules/@tanstack/react-query/$1",
      },
      {
        find: /^@testing-library\/react$/,
        replacement:
          "/app/repository_after/client/node_modules/@testing-library/react",
      },
      {
        find: /^@testing-library\/react\/(.*)$/,
        replacement:
          "/app/repository_after/client/node_modules/@testing-library/react/$1",
      },
      {
        find: /^@testing-library\/jest-dom\/vitest$/,
        replacement:
          "/app/repository_after/client/node_modules/@testing-library/jest-dom/vitest.js",
      },
      {
        find: /^@testing-library\/jest-dom\/(.*)$/,
        replacement:
          "/app/repository_after/client/node_modules/@testing-library/jest-dom/$1",
      },
    ],
  },
  server: {
    fs: {
      allow: ["/app"],
    },
  },
  test: {
    environment: "jsdom",
    include: ["/app/tests/client/**/*.test.tsx"],
    setupFiles: ["src/setupTests.ts"],
  },
});
