import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

export default defineConfig({
  root: __dirname,
  server: {
    fs: { allow: [projectRoot, __dirname] },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
      '@impl': path.join(__dirname, 'src'),
      '@testing-library/react': path.join(projectRoot, 'node_modules', '@testing-library/react'),
      '@testing-library/jest-dom': path.join(projectRoot, 'node_modules', '@testing-library/jest-dom'),
      '@testing-library/user-event': path.join(projectRoot, 'node_modules', '@testing-library/user-event'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [path.join(__dirname, 'tests', 'setup.ts')],
    include: ['../tests/**/*.{test,spec}.{ts,tsx}'],
    pool: 'threads',
    testTimeout: 8_000,
    hookTimeout: 4_000,
  },
});
