const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results.json' }]
  ],
  use: {
    baseURL: process.env.TEST_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    headless: true,
  },
  webServer: {
    command: process.env.TEST_URL?.includes('3001')
      ? 'npx http-server repository_before -p 3001 -s'
      : 'npx http-server repository_after -p 3000 -s',
    port: process.env.TEST_URL?.includes('3001') ? 3001 : 3000,
    reuseExistingServer: !process.env.CI,
  },
});
