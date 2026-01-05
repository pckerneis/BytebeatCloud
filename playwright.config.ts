import { defineConfig, devices } from '@playwright/test';

const port = 3033;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  globalSetup: './e2e/utils/global-setup',
  testDir: './e2e',
  timeout: 30_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- -p ${port}`,
      port,
      reuseExistingServer: false,
    },
  ],
});
