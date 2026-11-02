import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4317', browserName: 'chromium', headless: true },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:4317', reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
