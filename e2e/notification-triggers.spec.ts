import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+notiftrig@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_notiftrig_user';

const OTHER_USER_EMAIL = 'e2e+notiftrig_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_notiftrig_other';

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

  // Clean up notifications, posts, favorites, follows
  await supabaseAdmin.from('notifications').delete().eq('user_id', testUserId);
  await supabaseAdmin.from('notifications').delete().eq('user_id', otherUserId);
  await supabaseAdmin.from('favorites').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('favorites').delete().eq('profile_id', otherUserId);
  await supabaseAdmin.from('follows').delete().eq('follower_id', testUserId);
  await supabaseAdmin.from('follows').delete().eq('follower_id', otherUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', otherUserId);
});

test.describe('Notification triggers - follow', () => {
  test('following a user creates a notification for them', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Sign in as test user
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    // Go to other user's profile and follow them
    await page.goto(`/u/${OTHER_USERNAME}`);

    await page.getByRole('button', { name: 'Follow' }).click();
    await expect(page.getByRole('button', { name: 'Followed' })).toBeVisible();

    // Check that a notification was created for the other user
    const { data: notifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', otherUserId)
      .eq('event_type', 'follow')
      .eq('actor_id', testUserId);

    expect(notifications).toHaveLength(1);
    expect(notifications![0].read).toBe(false);
  });

  test('unfollowing does not create a notification', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Pre-follow
    await supabaseAdmin.from('follows').insert({
      follower_id: testUserId,
      followed_id: otherUserId,
    });

    // Clear any notifications from the follow
    await supabaseAdmin.from('notifications').delete().eq('user_id', otherUserId);

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    await page.goto(`/u/${OTHER_USERNAME}`);

    // Unfollow
    await page.getByRole('button', { name: 'Followed' }).click();
    await expect(page.getByRole('button', { name: 'Follow' })).toBeVisible();

    // No new notification should be created
    const { data: notifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', otherUserId);

    expect(notifications).toHaveLength(0);
  });
});

test.describe('Notification triggers - favorite', () => {
  test('favoriting a post creates a notification for the author', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create a post by other user
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post To Favorite',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    // Go to explore and favorite the post
    await page.goto('/explore?tab=recent');
    const favoriteButton = page.locator('.post-item .favorite-button');
    await expect(favoriteButton).toBeVisible({ timeout: 10000 });

    await favoriteButton.click();
    await expect(favoriteButton).toHaveClass(/favorited/, { timeout: 5000 });

    // Wait a moment for the notification trigger to complete
    await page.waitForTimeout(500);

    // Check notification was created
    const { data: notifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', otherUserId)
      .eq('event_type', 'favorite')
      .eq('actor_id', testUserId)
      .eq('post_id', post!.id);

    expect(notifications).toHaveLength(1);
    expect(notifications![0].read).toBe(false);
  });

  test('unfavoriting does not create a notification', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create a post by other user
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post To Unfavorite',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Pre-favorite
    await supabaseAdmin.from('favorites').insert({
      profile_id: testUserId,
      post_id: post!.id,
    });

    // Clear any notifications
    await supabaseAdmin.from('notifications').delete().eq('user_id', otherUserId);

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    await page.goto('/explore?tab=recent');
    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    // Unfavorite
    await page.locator('.post-item .favorite-button').click();
    await expect(page.locator('.post-item .favorite-button')).not.toHaveClass(/favorited/);

    // No new notification
    const { data: notifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', otherUserId);

    expect(notifications).toHaveLength(0);
  });

  test('favoriting own post does not create a notification', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    // Create own post
    await supabaseAdmin.from('posts').insert({
      profile_id: testUserId,
      title: 'My Own Post',
      expression: 't',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    });

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    await page.goto('/profile');
    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    // Favorite own post
    await page.locator('.post-item .favorite-button').click();
    await expect(page.locator('.post-item .favorite-button')).toHaveClass(/favorited/);

    // No notification for self
    const { data: notifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', testUserId)
      .eq('event_type', 'favorite');

    expect(notifications).toHaveLength(0);
  });
});

// Helper to type into CodeMirror editor
async function typeInExpressionEditor(page: import('@playwright/test').Page, text: string) {
  const editor = page.locator('.expression-input .cm-content');
  await editor.click();
  await page.keyboard.type(text);
}

test.describe('Notification triggers - fork', () => {
  test('forking a post creates a notification for the original author', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create a post by other user
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post To Fork',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    // Fork the post
    await page.goto(`/fork/${post!.id}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.clear();
    await titleField.fill('My Fork');

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(/\/post\//);

    // Check notification was created
    const { data: notifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', otherUserId)
      .eq('event_type', 'fork')
      .eq('actor_id', testUserId);

    expect(notifications).toHaveLength(1);
    expect(notifications![0].read).toBe(false);
  });

  test('forking own post does not create a notification', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    // Create own post
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'My Own Post To Fork',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    // Fork own post
    await page.goto(`/fork/${post!.id}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.clear();
    await titleField.fill('Fork Of My Own');

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(/\/post\//);

    // No notification for self
    const { data: notifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', testUserId)
      .eq('event_type', 'fork');

    expect(notifications).toHaveLength(0);
  });

  test('saving fork as draft does not create a notification', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create a post by other user
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post To Fork As Draft',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    await page.goto(`/fork/${post!.id}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Save as draft
    await page.getByLabel('Save as draft').check();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Fork saved.')).toBeVisible();

    // No notification for draft
    const { data: notifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', otherUserId)
      .eq('event_type', 'fork');

    expect(notifications).toHaveLength(0);
  });
});

test.describe('Notification triggers - mention', () => {
  test('mentioning a user in post description creates a notification', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    // Create a post with a mention
    await page.goto('/create');

    await typeInExpressionEditor(page, 't');

    const descriptionField = page.getByPlaceholder('Add an optional description');
    await descriptionField.fill(`Check this out @${OTHER_USERNAME}!`);

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(/\/post\//);

    // Wait a moment for the notification trigger to complete
    await page.waitForTimeout(500);

    // Check notification was created
    const { data: notifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', otherUserId)
      .eq('event_type', 'mention')
      .eq('actor_id', testUserId);

    expect(notifications).toHaveLength(1);
    expect(notifications![0].read).toBe(false);
  });

  test('mentioning self does not create a notification', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    await page.goto('/create');

    await typeInExpressionEditor(page, 't');

    const descriptionField = page.getByPlaceholder('Add an optional description');
    await descriptionField.fill(`I'm mentioning myself @${TEST_USERNAME}`);

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(/\/post\//);

    // No notification for self-mention
    const { data: notifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', testUserId)
      .eq('event_type', 'mention');

    expect(notifications).toHaveLength(0);
  });

  test('mentioning in draft does not create a notification', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    await page.goto('/create');

    await typeInExpressionEditor(page, 't');

    const descriptionField = page.getByPlaceholder('Add an optional description');
    await descriptionField.fill(`Draft mention @${OTHER_USERNAME}`);

    // Save as draft
    await page.getByLabel('Save as draft').check();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Post saved.')).toBeVisible();

    // No notification for draft
    const { data: mentionNotifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', otherUserId)
      .eq('event_type', 'mention');

    expect(mentionNotifications).toHaveLength(0);
  });

  test('multiple mentions create multiple notifications', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create a third user
    const thirdUser = await ensureTestUser({
      email: 'e2e+notiftrig_third@example.com',
      password: 'password123',
    });
    await ensureTestUserProfile('e2e+notiftrig_third@example.com', 'e2e_third_user');

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    await page.goto('/create');

    await typeInExpressionEditor(page, 't');

    const descriptionField = page.getByPlaceholder('Add an optional description');
    await descriptionField.fill(`Hey @${OTHER_USERNAME} and @e2e_third_user!`);

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(/\/post\//);

    // Check notifications for both users
    const { data: notif1 } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', otherUserId)
      .eq('event_type', 'mention');

    const { data: notif2 } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', thirdUser.id)
      .eq('event_type', 'mention');

    expect(notif1).toHaveLength(1);
    expect(notif2).toHaveLength(1);

    // Cleanup third user
    await supabaseAdmin.from('notifications').delete().eq('user_id', thirdUser.id);
    await supabaseAdmin.from('profiles').delete().eq('id', thirdUser.id);
  });
});
