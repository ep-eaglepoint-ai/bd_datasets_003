export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['frontend/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**']
  }
})
