import { createClient } from '@supabase/supabase-js';

const url =
  process.env.E2E_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';

const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.warn(
    '[e2e] E2E_SUPABASE_SERVICE_ROLE_KEY is not set. Admin helpers will not work properly.',
  );
}

export const supabaseAdmin = createClient(url, serviceRoleKey ?? '', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export async function clearProfilesTable() {
  const { error } = await supabaseAdmin
    .from('profiles')
    // Delete all rows; using a non-restrictive filter as PostgREST requires one
    .delete()
    .not('id', 'is', null);

  if (error) {
    throw new Error(`[e2e] Failed to clear profiles table: ${error.message}`);
  }
}

export async function createTestUser(params: { email: string; password?: string }) {
  const { email, password = 'password123' } = params;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }

  return data.user;
}

export async function ensureTestUser(params: { email: string; password?: string }) {
  const { email, password } = params;

  // Try to find an existing user first to avoid duplicates across test runs.
  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (!listError) {
    const existing = list.users.find((u) => u.email === email);
    if (existing) {
      return existing;
    }
  }

  // Fall back to creating if not found or listing failed.
  return createTestUser({ email, password });
}
