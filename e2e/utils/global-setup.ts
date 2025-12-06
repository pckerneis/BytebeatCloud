import { execSync } from 'node:child_process';

function supabaseStatus() {
  try {
    const out = execSync('supabase status -o json', { encoding: 'utf-8' });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

export default async function globalSetup() {
  const status = supabaseStatus();

  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.PUBLISHABLE_KEY;
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;

  if (!status) {
    throw new Error('Supabase must be running before starting e2e tests.');
  }

  execSync('supabase db reset', { stdio: 'inherit' });
}
