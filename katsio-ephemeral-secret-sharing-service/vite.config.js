import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { existsSync } from 'fs'

// Determine setup file path (works in both Docker and local)
const setupFile = existsSync('./src/test/setup.js') 
  ? './src/test/setup.js' 
  : './repository_after/frontend/src/test/setup.js';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './repository_after/frontend/src'),
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
    include: ['tests/**/*.{test,spec}.{js,jsx}'],
  },
})

