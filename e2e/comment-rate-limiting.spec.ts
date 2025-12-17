import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+ratelimit@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_ratelimit_user';

const OTHER_USER_EMAIL = 'e2e+ratelimit_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_ratelimit_other';

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

  // Clean up comments, notifications, and posts
  await supabaseAdmin.from('comments').delete().not('id', 'is', null);
  await supabaseAdmin.from('notifications').delete().not('id', 'is', null);
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', otherUserId);
});

test.describe('Comment rate limiting - thread spam', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create a post by other user
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post For Rate Limit Test',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    testPostId = data!.id;

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('shows error after 3 comments in 60 seconds on same post', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    const postButton = page.getByRole('button', { name: 'Post comment' });

    // Post 3 comments quickly
    for (let i = 1; i <= 3; i++) {
      await textarea.fill(`Comment ${i}`);
      await expect(postButton).toBeEnabled();
      await postButton.click();
      await expect(page.getByText(`Comment ${i}`)).toBeVisible({ timeout: 5000 });
      // Wait for textarea to be cleared and ready for next input
      await expect(textarea).toHaveValue('');
    }

    // 4th comment should be rate limited
    await textarea.fill('Comment 4 - should fail');
    await expect(postButton).toBeEnabled();
    await postButton.click();

    // Should show thread spam error
    await expect(page.getByText('Let others reply before continuing')).toBeVisible({
      timeout: 5000,
    });

    // The 4th comment should NOT appear in the comments list
    await expect(
      page.locator('.comments-list').getByText('Comment 4 - should fail'),
    ).not.toBeVisible();
  });
});

test.describe('Comment rate limiting - mentions', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create a post by other user
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post For Mention Limit Test',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    testPostId = data!.id;

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('shows error when comment has more than 5 mentions', async ({ page }) => {
    // Create 6 users to mention
    const mentionUsers: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const email = `e2e+mention${i}@example.com`;
      const user = await ensureTestUser({ email, password: 'password123' });
      await ensureTestUserProfile(email, `mention_user_${i}`);
      mentionUsers.push(user.id);
    }

    await page.goto(`/post/${testPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    const postButton = page.getByRole('button', { name: 'Post comment' });

    // Try to post a comment with 6 mentions
    await textarea.fill(
      '@mention_user_1 @mention_user_2 @mention_user_3 @mention_user_4 @mention_user_5 @mention_user_6',
    );
    await expect(postButton).toBeEnabled();
    await postButton.click();

    // Should show mention limit error
    await expect(page.getByText('Too many mentions - maximum 5 per comment')).toBeVisible({
      timeout: 5000,
    });
  });

  test('allows comment with exactly 5 mentions', async ({ page }) => {
    // Create 5 users to mention
    for (let i = 1; i <= 5; i++) {
      const email = `e2e+mention${i}@example.com`;
      await ensureTestUser({ email, password: 'password123' });
      await ensureTestUserProfile(email, `mention_user_${i}`);
    }

    await page.goto(`/post/${testPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    const postButton = page.getByRole('button', { name: 'Post comment' });

    // Post a comment with exactly 5 mentions
    await textarea.fill(
      '@mention_user_1 @mention_user_2 @mention_user_3 @mention_user_4 @mention_user_5 hello!',
    );
    await expect(postButton).toBeEnabled();
    await postButton.click();

    // Should succeed - comment should appear
    await expect(page.getByText('hello!')).toBeVisible({ timeout: 5000 });

    // No error should be shown
    await expect(page.getByText('Too many mentions')).not.toBeVisible();
  });
});

test.describe('Comment rate limiting - per minute limit', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
  });

  test('shows error after 5 comments per minute across different posts', async ({ page }) => {
    // Create 6 posts to comment on (to avoid thread spam limit)
    const postIds: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const { data } = await supabaseAdmin
        .from('posts')
        .insert({
          profile_id: otherUserId,
          title: `Post ${i} for rate limit`,
          expression: 't',
          is_draft: false,
          sample_rate: 8000,
          mode: 'uint8',
        })
        .select('id')
        .single();
      postIds.push(data!.id);
    }

    // Post 5 comments on different posts
    for (let i = 0; i < 5; i++) {
      await page.goto(`/post/${postIds[i]}`);
      await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

      const textarea = page.locator('textarea[placeholder="Add a comment..."]');
      const postButton = page.getByRole('button', { name: 'Post comment' });
      await textarea.fill(`Comment on post ${i + 1}`);
      await expect(postButton).toBeEnabled();
      await postButton.click();
      await expect(page.getByText(`Comment on post ${i + 1}`)).toBeVisible({ timeout: 5000 });
    }

    // 6th comment should be rate limited
    await page.goto(`/post/${postIds[5]}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    const postButton = page.getByRole('button', { name: 'Post comment' });
    await textarea.fill('Comment 6 - should fail');
    await expect(postButton).toBeEnabled();
    await postButton.click();

    // Should show rate limit error
    await expect(page.getByText("You're commenting too fast - take a short break")).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe('Comment rate limiting - notification emission limit', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
  });

  test('stops emitting notifications after 20 per hour', async ({ page }) => {
    // Create 3 posts by other user
    const postIds: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const { data } = await supabaseAdmin
        .from('posts')
        .insert({
          profile_id: otherUserId,
          title: `Post ${i} for notification limit`,
          expression: 't',
          is_draft: false,
          sample_rate: 8000,
          mode: 'uint8',
        })
        .select('id')
        .single();
      postIds.push(data!.id);
    }

    // Pre-seed 19 notifications to get close to the limit
    // (simulating the user has already sent 19 notifications this hour)
    for (let i = 0; i < 19; i++) {
      await supabaseAdmin.from('notifications').insert({
        user_id: otherUserId,
        actor_id: testUserId,
        event_type: 'comment',
        post_id: postIds[0], // All on first post for simplicity
      });
    }

    // Now use UI to create a comment - should create notification #20 (hitting limit)
    await page.goto(`/post/${postIds[1]}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    const postButton = page.getByRole('button', { name: 'Post comment' });

    await textarea.fill('Comment that should notify');
    await expect(postButton).toBeEnabled();
    await postButton.click();
    await expect(page.getByText('Comment that should notify')).toBeVisible({ timeout: 5000 });

    // Check notification was created
    const { data: notifs20 } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('actor_id', testUserId)
      .eq('post_id', postIds[1]);

    expect(notifs20).toHaveLength(1);

    // Now create another comment on a different post - should NOT create notification (over limit)
    await page.goto(`/post/${postIds[2]}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await textarea.fill('Comment that should NOT notify');
    await expect(postButton).toBeEnabled();
    await postButton.click();
    await expect(page.getByText('Comment that should NOT notify')).toBeVisible({ timeout: 5000 });

    // No notification should be created for this comment
    const { data: notifs21 } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('actor_id', testUserId)
      .eq('post_id', postIds[2]);

    expect(notifs21).toHaveLength(0);

    // Total notifications should be exactly 20
    const { data: allNotifs } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('actor_id', testUserId);

    expect(allNotifs).toHaveLength(20);
  });
});

test.describe('Comment rate limiting - RPC validation', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post For Validation Test',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    testPostId = data!.id;

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('cannot post empty comment', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Button should be disabled when textarea is empty
    const postButton = page.getByRole('button', { name: 'Post comment' });
    await expect(postButton).toBeDisabled();
  });

  test('successful comment clears error state', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    const postButton = page.getByRole('button', { name: 'Post comment' });

    // Post a valid comment
    await textarea.fill('Valid comment');
    await postButton.click();

    // Comment should appear
    await expect(page.getByText('Valid comment')).toBeVisible({ timeout: 5000 });

    // No error should be shown
    await expect(page.locator('.error-message')).not.toBeVisible();
  });
});
