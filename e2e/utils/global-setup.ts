import { execSync } from 'node:child_process';

export default async function globalSetup() {
  const out = execSync('supabase status -o json', { encoding: 'utf-8' });
  const status = JSON.parse(out);

  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.PUBLISHABLE_KEY;
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;

  if (!status) {
    throw new Error('Supabase must be running before starting e2e tests.');
  }

  execSync('supabase db reset', { stdio: 'inherit' });
}
