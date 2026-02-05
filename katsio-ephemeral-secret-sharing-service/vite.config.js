import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { existsSync } from 'fs'


// Determine setup file path (works in both Docker and local)
const setupFile = existsSync('./src/test/setup.js')
  ? './src/test/setup.js'
  : './repository_after/frontend/src/test/setup.js';

// Determine source path (works in both Docker and local)
// In Docker: ./src exists (mounted from repository_after/frontend/src)
// Locally: ./repository_after/frontend/src exists
const srcPath = existsSync('./src')
  ? path.resolve(__dirname, './src')
  : path.resolve(__dirname, './repository_after/frontend/src');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': srcPath,
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: setupFile,
    include: ['tests/**/*.{test,spec}.{js,jsx}', 'tests/frontend/test_*.{js,jsx}'],
  },
})

