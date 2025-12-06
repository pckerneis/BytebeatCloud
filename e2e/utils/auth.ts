import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[e2e] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Auth helpers will fail.',
  );
}

function getStorageKey(url: string): string {
  const u = new URL(url);
  // Supabase JS v2 uses `sb-${projectRef}-auth-token` where projectRef is the host part.
  const projectRef = u.host; // works for both hosted and local (e.g. 127.0.0.1:54321)
  return `sb-${projectRef}-auth-token`;
}

export async function signInAndInjectSession(
  page: Page,
  params: { email: string; password: string },
) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('[e2e] Supabase URL or anon key missing in env.');
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { email, password } = params;

  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    throw new Error(`[e2e] Failed to sign in test user: ${error?.message ?? 'no session'}`);
  }

  const storageKey = process.env.NEXT_PUBLIC_AUTH_STORAGE_KEY || getStorageKey(supabaseUrl);
  const session = data.session;

  // Supabase persists the session as a flat object (Session) at sb-<projectRef>-auth-token
  // with fields: access_token, refresh_token, expires_in, expires_at (seconds), token_type, user
  const payload = {
    key: storageKey,
    value: session,
  } as const;

  // Inject Supabase session into localStorage before any page scripts run.
  await page.addInitScript((data) => {
    window.localStorage.setItem(data.key, JSON.stringify(data.value));
  }, payload);
}

export async function clearSupabaseSession(page: Page) {
  // Clear Supabase auth-related state before the app loads.
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
}
