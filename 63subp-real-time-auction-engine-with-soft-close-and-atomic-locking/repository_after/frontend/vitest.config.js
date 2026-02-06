import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()], // 1. Support React syntax (JSX)
  test: {
    globals: true,      // 2. Use 'describe' and 'test' without importing them
    environment: 'jsdom', // 3. Create a "fake browser" window
    setupFiles: './src/setupTests.js', // 4. Load extra powers (like .toBeInTheDocument)
  },
});