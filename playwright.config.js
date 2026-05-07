const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  // Extension tests use launchPersistentContext in fixtures — no project browser config needed
  use: {
    viewport: { width: 1400, height: 900 },
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
