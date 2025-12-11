import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'node:child_process';

const port = 3033;
const baseURL = `http://127.0.0.1:${port}`;

function getSupabaseEnv() {
  const out = execSync('supabase status -o json', { encoding: 'utf-8' });
  const status = JSON.parse(out) as {
    API_URL: string;
    PUBLISHABLE_KEY: string;
    SERVICE_ROLE_KEY: string;
  };

  const env: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  };

  process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_AUTH_STORAGE_KEY = env.NEXT_PUBLIC_AUTH_STORAGE_KEY;

  return env;
}

const supabaseEnv = getSupabaseEnv();

export default defineConfig({
  globalSetup: './e2e/utils/global-setup',
  testDir: './e2e',
  timeout: 30_000,
  // retries: process.env.CI ? 3 : 0,
  retries: 3,
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
      env: supabaseEnv,
    },
  ],
});
