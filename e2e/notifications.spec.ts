import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+notif@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_notif_user';

const OTHER_USER_EMAIL = 'e2e+notif_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_notif_other';

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

  // Clean up notifications and posts
  await supabaseAdmin.from('notifications').delete().eq('user_id', testUserId);
  await supabaseAdmin.from('notifications').delete().eq('user_id', otherUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', otherUserId);
});

test.describe('Notifications page - viewing', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
  });

  test('shows empty message when no notifications', async ({ page }) => {
    await page.goto('/notifications');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByText('No notifications yet.')).toBeVisible();
  });

  test('shows follow notification', async ({ page }) => {
    // Create a follow notification
    await supabaseAdmin.from('notifications').insert({
      user_id: testUserId,
      actor_id: otherUserId,
      event_type: 'follow',
      read: false,
    });

    await page.goto('/notifications');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByRole('link', { name: `@${OTHER_USERNAME}` })).toBeVisible();
    await expect(page.getByText('followed you')).toBeVisible();
  });

  test('shows favorite notification with post link', async ({ page }) => {
    // Create a post
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'My Favorited Post',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Create a favorite notification
    await supabaseAdmin.from('notifications').insert({
      user_id: testUserId,
      actor_id: otherUserId,
      event_type: 'favorite',
      post_id: post!.id,
      read: false,
    });

    await page.goto('/notifications');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByRole('link', { name: `@${OTHER_USERNAME}` })).toBeVisible();
    await expect(page.getByText('favorited one of your posts')).toBeVisible();
    await expect(page.getByRole('link', { name: 'My Favorited Post' })).toBeVisible();
  });

  test('shows fork notification with post link', async ({ page }) => {
    // Create a post
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'My Forked Post',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Create a fork notification
    await supabaseAdmin.from('notifications').insert({
      user_id: testUserId,
      actor_id: otherUserId,
      event_type: 'fork',
      post_id: post!.id,
      read: false,
    });

    await page.goto('/notifications');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByText('forked one of your posts')).toBeVisible();
    await expect(page.getByRole('link', { name: 'My Forked Post' })).toBeVisible();
  });

  test('unread notifications have unread styling', async ({ page }) => {
    await supabaseAdmin.from('notifications').insert({
      user_id: testUserId,
      actor_id: otherUserId,
      event_type: 'follow',
      read: false,
    });

    await page.goto('/notifications');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.locator('.notification-item.is-unread')).toHaveCount(1);
  });

  test('read notifications do not have unread styling', async ({ page }) => {
    await supabaseAdmin.from('notifications').insert({
      user_id: testUserId,
      actor_id: otherUserId,
      event_type: 'follow',
      read: true,
    });

    await page.goto('/notifications');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.locator('.notification-item.is-unread')).toHaveCount(0);
    await expect(page.locator('.notification-item')).toHaveCount(1);
  });
});

test.describe('Notifications page - mark as read', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
  });

  test('clicking notification link marks it as read', async ({ page }) => {
    await supabaseAdmin.from('notifications').insert({
      user_id: testUserId,
      actor_id: otherUserId,
      event_type: 'follow',
      read: false,
    });

    await page.goto('/notifications');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Initially unread
    await expect(page.locator('.notification-item.is-unread')).toHaveCount(1);

    // Click the username link
    await page.getByRole('link', { name: `@${OTHER_USERNAME}` }).click();

    // Navigate back
    await page.goto('/notifications');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Should now be read
    await expect(page.locator('.notification-item.is-unread')).toHaveCount(0);
  });

  test('mark all as read button marks all notifications as read', async ({ page }) => {
    // Create multiple unread notifications
    await supabaseAdmin.from('notifications').insert([
      {
        user_id: testUserId,
        actor_id: otherUserId,
        event_type: 'follow',
        read: false,
      },
      {
        user_id: testUserId,
        actor_id: otherUserId,
        event_type: 'follow',
        read: false,
      },
    ]);

    await page.goto('/notifications');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Initially 2 unread
    await expect(page.locator('.notification-item.is-unread')).toHaveCount(2);

    // Click mark all as read
    await page.getByRole('button', { name: 'Mark all as read' }).click();

    // All should be read now
    await expect(page.locator('.notification-item.is-unread')).toHaveCount(0);
  });

  test('mark all as read button hidden when no unread notifications', async ({ page }) => {
    await supabaseAdmin.from('notifications').insert({
      user_id: testUserId,
      actor_id: otherUserId,
      event_type: 'follow',
      read: true,
    });

    await page.goto('/notifications');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByText('Loading…')).not.toBeVisible();
    await expect(page.getByText('No notifications yet.')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0);
  });
});

test.describe('Notifications page - navigation', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
  });

  test('clicking username navigates to user profile', async ({ page }) => {
    await supabaseAdmin.from('notifications').insert({
      user_id: testUserId,
      actor_id: otherUserId,
      event_type: 'follow',
      read: false,
    });

    await page.goto('/notifications');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await page.getByRole('link', { name: `@${OTHER_USERNAME}` }).click();

    await page.waitForURL(`/u/${OTHER_USERNAME}`);
  });

  test('clicking post link navigates to post detail', async ({ page }) => {
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Notification Post',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await supabaseAdmin.from('notifications').insert({
      user_id: testUserId,
      actor_id: otherUserId,
      event_type: 'favorite',
      post_id: post!.id,
      read: false,
    });

    await page.goto('/notifications');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await page.getByRole('link', { name: 'Notification Post' }).click();

    await page.waitForURL(`/post/${post!.id}`);
  });
});

test.describe('Notifications page - unauthenticated', () => {
  test('shows empty state when not logged in', async ({ page }) => {
    await clearSupabaseSession(page);

    await page.goto('/notifications');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByText('No notifications yet.')).toBeVisible();
  });
});
