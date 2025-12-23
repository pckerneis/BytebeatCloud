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

export async function ensureTestUserProfileWithOutdatedTos(email: string, username: string) {
  // Find the user by email
  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    throw new Error(`[e2e] Failed to list users: ${listError.message}`);
  }

  const user = list.users.find((u) => u.email === email);
  if (!user) {
    throw new Error(`[e2e] User with email ${email} not found`);
  }

  // Upsert profile with username and OUTDATED tos_version
  const { error } = await supabaseAdmin.from('profiles').upsert(
    {
      id: user.id,
      username,
      tos_version: 'outdated-version',
      tos_accepted_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (error) {
    throw new Error(`[e2e] Failed to create profile: ${error.message}`);
  }
}

export async function ensureTestUserProfile(email: string, username: string) {
  // Find the user by email
  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    throw new Error(`[e2e] Failed to list users: ${listError.message}`);
  }

  const user = list.users.find((u) => u.email === email);
  if (!user) {
    throw new Error(`[e2e] User with email ${email} not found`);
  }

  // Upsert profile with username
  const { error } = await supabaseAdmin.from('profiles').upsert(
    {
      id: user.id,
      username,
      tos_version: '2025-12-17-v1',
      tos_accepted_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (error) {
    throw new Error(`[e2e] Failed to create profile: ${error.message}`);
  }

  return { userId: user.id, username };
}

/**
 * Create a comment directly via admin (bypasses RLS).
 * Use this for seeding test data, not for testing the comment creation flow.
 */
export async function createCommentAsAdmin(params: {
  postId: string;
  authorId: string;
  content: string;
}) {
  const { data, error } = await supabaseAdmin
    .from('comments')
    .insert({
      post_id: params.postId,
      author_id: params.authorId,
      content: params.content,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`[e2e] Failed to create comment: ${error.message}`);
  }

  return data;
}

/**
 * Wait for tags to be indexed by the database trigger after inserting a post.
 * The trigger runs synchronously but there can be transaction visibility delays.
 */
export async function waitForTagsIndexed(postId: string, expectedCount: number, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await supabaseAdmin.from('post_tags').select('tag_id').eq('post_id', postId);
    if (data && data.length >= expectedCount) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}
