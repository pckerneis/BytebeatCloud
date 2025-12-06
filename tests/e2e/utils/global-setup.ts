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

  if (!status) {
    throw new Error('Supabase must be running before starting e2e tests.');
  }

  execSync('supabase db reset', { stdio: 'inherit' });
}