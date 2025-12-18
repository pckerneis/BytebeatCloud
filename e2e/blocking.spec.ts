import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+blocking@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_blocking_user';

const OTHER_USER_EMAIL = 'e2e+blocking_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_blocking_other';

let testUserId: string;
let otherUserId: string;

test.beforeAll(async () => {
  const user = await ensureTestUser({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  testUserId = user.id;

  const otherUser = await ensureTestUser({
    email: OTHER_USER_EMAIL,
    password: OTHER_USER_PASSWORD,
  });
  otherUserId = otherUser.id;
});

test.beforeEach(async () => {
  await clearProfilesTable();

  // Clean up blocked_users and posts
  await supabaseAdmin.from('blocked_users').delete().eq('blocker_id', testUserId);
  await supabaseAdmin.from('blocked_users').delete().eq('blocker_id', otherUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', otherUserId);
});

test.describe('Blocking users', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('can block a user from user actions page', async ({ page }) => {
    await page.goto(`/user-actions/${OTHER_USERNAME}`);

    const blockButton = page.getByRole('button', { name: 'Block user' });
    await expect(blockButton).toBeVisible({ timeout: 10000 });

    await blockButton.click();

    // Confirmation modal should appear
    await expect(page.getByRole('heading', { name: 'Block this user?' })).toBeVisible();

    // Confirm the action
    await page.getByRole('button', { name: 'Block', exact: true }).click();

    // Button should change to "Unblock user"
    await expect(page.getByRole('button', { name: 'Unblock user' })).toBeVisible({ timeout: 5000 });
  });

  test('can unblock a user from user actions page', async ({ page }) => {
    // Pre-block the user
    await supabaseAdmin.from('blocked_users').insert({
      blocker_id: testUserId,
      blocked_id: otherUserId,
    });

    await page.goto(`/user-actions/${OTHER_USERNAME}`);

    const unblockButton = page.getByRole('button', { name: 'Unblock user' });
    await expect(unblockButton).toBeVisible({ timeout: 10000 });

    await unblockButton.click();

    // Confirmation modal should appear
    await expect(page.getByRole('heading', { name: 'Unblock this user?' })).toBeVisible();

    // Confirm the action
    await page.getByRole('button', { name: 'Unblock', exact: true }).click();

    // Button should change back to "Block user"
    await expect(page.getByRole('button', { name: 'Block user' })).toBeVisible({ timeout: 5000 });
  });

  test('can unblock a user from update-profile page', async ({ page }) => {
    // Pre-block the user
    await supabaseAdmin.from('blocked_users').insert({
      blocker_id: testUserId,
      blocked_id: otherUserId,
    });

    await page.goto('/update-profile');

    // Should see blocked users section
    await expect(page.getByRole('heading', { name: 'Blocked users' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(`@${OTHER_USERNAME}`)).toBeVisible();

    // Click unblock
    await page.getByRole('button', { name: 'Unblock' }).click();

    // User should disappear from the list
    await expect(page.getByText(`@${OTHER_USERNAME}`)).not.toBeVisible({ timeout: 5000 });
  });

  test('blocked user posts are hidden from feed', async ({ page }) => {
    // Create a post by other user
    await supabaseAdmin.from('posts').insert({
      profile_id: otherUserId,
      title: 'Post by blocked user',
      expression: 't',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    });

    // Verify post is visible before blocking
    await page.goto('/explore?tab=recent');
    await expect(page.getByText('Post by blocked user')).toBeVisible({ timeout: 10000 });

    // Block the user
    await supabaseAdmin.from('blocked_users').insert({
      blocker_id: testUserId,
      blocked_id: otherUserId,
    });

    // Reload and verify post is hidden
    await page.reload();
    await expect(page.getByText('Post by blocked user')).not.toBeVisible({ timeout: 5000 });
  });

  test('blocked user cannot see blocker posts', async ({ page }) => {
    // Create a post by test user
    await supabaseAdmin.from('posts').insert({
      profile_id: testUserId,
      title: 'Post by blocker',
      expression: 't',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    });

    // Block the other user
    await supabaseAdmin.from('blocked_users').insert({
      blocker_id: testUserId,
      blocked_id: otherUserId,
    });

    // Sign in as the blocked user
    await signInAndInjectSession(page, {
      email: OTHER_USER_EMAIL,
      password: OTHER_USER_PASSWORD,
    });

    // Verify the blocker's post is hidden
    await page.goto('/explore?tab=recent');
    await expect(page.getByText('Post by blocker')).not.toBeVisible({ timeout: 5000 });
  });

  test('blocked user cannot see blocker profile', async ({ page }) => {
    // Block the other user
    await supabaseAdmin.from('blocked_users').insert({
      blocker_id: testUserId,
      blocked_id: otherUserId,
    });

    // Sign in as the blocked user
    await signInAndInjectSession(page, {
      email: OTHER_USER_EMAIL,
      password: OTHER_USER_PASSWORD,
    });

    // Try to visit blocker's profile
    await page.goto(`/u/${TEST_USERNAME}`);

    // Should show profile not found or similar error
    await expect(page.getByText('User not found')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Blocking - unauthenticated', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
    await clearSupabaseSession(page);
  });

  test('block button not visible when not logged in', async ({ page }) => {
    await page.goto(`/user-actions/${OTHER_USERNAME}`);

    // Should redirect to login or not show block button
    await expect(page.getByRole('button', { name: 'Block user' })).not.toBeVisible({
      timeout: 5000,
    });
  });
});
