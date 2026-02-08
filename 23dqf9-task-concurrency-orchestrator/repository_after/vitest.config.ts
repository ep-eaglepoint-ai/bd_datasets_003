// vitest.config.ts  (at root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,js}'],
    globals: false,           // ← important if no tsconfig
    environment: 'node',
  },
});