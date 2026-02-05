import { defineConfig } from '../repository_after/frontend/node_modules/vitest/dist/config.js'
import vue from '../repository_after/frontend/node_modules/@vitejs/plugin-vue/dist/index.mjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      'vitest': path.resolve(__dirname, '../repository_after/frontend/node_modules/vitest'),
      '@vue/test-utils': path.resolve(__dirname, '../repository_after/frontend/node_modules/@vue/test-utils'),
      'vue': path.resolve(__dirname, '../repository_after/frontend/node_modules/vue')
    }
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')]
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['frontend/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    root: __dirname
  }
})
