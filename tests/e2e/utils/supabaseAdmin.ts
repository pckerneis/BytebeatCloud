import { createClient } from '@supabase/supabase-js';

const url =
  process.env.E2E_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'http://127.0.0.1:54321';

const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  // eslint-disable-next-line no-console
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

export async function createTestUser(params: {
  email: string;
  password?: string;
}) {
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
