import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    reporters: process.env.CI || process.argv.includes("--report") ? ["default", "json"] : ["default"],
    outputFile: {
      json: path.resolve(__dirname, "evaluation/report.json"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "repository_after/color-pallete-tool/src"),
    },
  },
});
