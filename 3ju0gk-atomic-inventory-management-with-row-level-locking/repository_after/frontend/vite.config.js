

/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({

  plugins: [react()],
  resolve: {
    alias: {
     
      'axios': path.resolve(__dirname, 'node_modules/axios'),
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      '@testing-library/react': path.resolve(__dirname, 'node_modules/@testing-library/react'),
      '@testing-library/user-event': path.resolve(__dirname, 'node_modules/@testing-library/user-event'),
      '@testing-library/jest-dom': path.resolve(__dirname, 'node_modules/@testing-library/jest-dom'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['../../tests/**/*.test.tsx'],
    server: {
      deps: {
       
        inline: [/@testing-library\/jest-dom/],
      },
    },
  },
 
  server: {
    fs: {
      allow: ['/app'],
    },
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://app:8000',
        changeOrigin: true,
        secure: false,
      },
    },
    watch: {
      usePolling: true,
    },
  },
});