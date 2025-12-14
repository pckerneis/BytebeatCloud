import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+analytics@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_analytics_user';

const OTHER_USER_EMAIL = 'e2e+analytics_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_analytics_other';

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

  // Clean up test data
  await supabaseAdmin.from('play_events').delete().not('id', 'is', null);
  await supabaseAdmin.from('favorites').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('favorites').delete().eq('profile_id', otherUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', otherUserId);
});

test.describe('Analytics page - authenticated', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('shows analytics page with no posts', async ({ page }) => {
    await page.goto('/analytics');

    await expect(page.getByRole('heading', { name: 'Creator Analytics' })).toBeVisible();
    await expect(page.getByText('No published posts yet.')).toBeVisible();
  });

  test('shows stats cards with published posts', async ({ page }) => {
    // Create a published post
    await supabaseAdmin.from('posts').insert({
      profile_id: testUserId,
      title: 'Analytics Test Post',
      expression: 't',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    });

    await page.goto('/analytics');

    await expect(page.getByRole('heading', { name: 'Creator Analytics' })).toBeVisible();

    // Check stats cards are visible
    await expect(page.locator('.analytics-stat-card')).toHaveCount(7, { timeout: 10000 });

    // Check "Published Posts" shows 1
    const publishedPostsCard = page
      .locator('.analytics-stat-card')
      .filter({ hasText: 'Published Posts' });
    await expect(publishedPostsCard.locator('.stat-value')).toHaveText('1');
  });

  test('shows post in performance table', async ({ page }) => {
    await supabaseAdmin.from('posts').insert({
      profile_id: testUserId,
      title: 'Performance Table Post',
      expression: 't',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    });

    await page.goto('/analytics');

    await expect(page.getByRole('heading', { name: 'Posts Performance' })).toBeVisible();
    await expect(page.locator('.analytics-table')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Performance Table Post' })).toBeVisible();
  });

  test('does not show draft posts in analytics', async ({ page }) => {
    // Create a draft post
    await supabaseAdmin.from('posts').insert({
      profile_id: testUserId,
      title: 'Draft Post',
      expression: 't',
      is_draft: true,
      sample_rate: 8000,
      mode: 'uint8',
    });

    await page.goto('/analytics');

    // Should show "No published posts" since only draft exists
    await expect(page.getByText('No published posts yet.')).toBeVisible();
  });

  test('period selector changes displayed data', async ({ page }) => {
    await supabaseAdmin.from('posts').insert({
      profile_id: testUserId,
      title: 'Period Test Post',
      expression: 't',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    });

    await page.goto('/analytics');

    // Default is 30 days
    await expect(page.locator('#period')).toHaveValue('30');

    // Change to 7 days
    await page.locator('#period').selectOption('7');

    // Check that the label updates
    await expect(page.locator('.analytics-stat-card').filter({ hasText: 'Last 7d' })).toHaveCount(
      2,
    );
  });

  test('shows play counts when play events exist', async ({ page }) => {
    // Create a post
    const { data: postData } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Post With Plays',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Add some play events
    await supabaseAdmin.from('play_events').insert([
      { post_id: postData!.id, profile_id: otherUserId, duration_seconds: 30 },
      { post_id: postData!.id, profile_id: otherUserId, duration_seconds: 45 },
      { post_id: postData!.id, profile_id: null, duration_seconds: 15 }, // anonymous play
    ]);

    await page.goto('/analytics');

    // Check total plays
    const totalPlaysCard = page.locator('.analytics-stat-card').filter({ hasText: 'Total Plays' });
    await expect(totalPlaysCard.locator('.stat-value')).toHaveText('3');

    // Check total play time (30 + 45 + 15 = 90 seconds = 1m 30s)
    const totalPlayTimeCard = page
      .locator('.analytics-stat-card')
      .filter({ hasText: 'Total Play Time' });
    await expect(totalPlayTimeCard.locator('.stat-value')).toHaveText('1m 30s');
  });

  test('shows unique listeners count', async ({ page }) => {
    const { data: postData } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Unique Listeners Post',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Add play events from different users
    await supabaseAdmin.from('play_events').insert([
      { post_id: postData!.id, profile_id: otherUserId, duration_seconds: 30 },
      { post_id: postData!.id, profile_id: otherUserId, duration_seconds: 20 }, // same user
      { post_id: postData!.id, profile_id: testUserId, duration_seconds: 10 }, // different user
    ]);

    await page.goto('/analytics');

    // Should show 2 unique listeners (otherUserId and testUserId)
    const uniqueListenersCard = page
      .locator('.analytics-stat-card')
      .filter({ hasText: 'Unique Listeners' });
    await expect(uniqueListenersCard.locator('.stat-value')).toHaveText('2');
  });

  test('post link navigates to post detail', async ({ page }) => {
    const { data: postData } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Clickable Post',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await page.goto('/analytics');

    await page.getByRole('link', { name: 'Clickable Post' }).click();

    await page.waitForURL(`/post/${postData!.id}`);
  });

  test('shows favorites count', async ({ page }) => {
    const { data: postData } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Favorited Post',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Add favorites
    await supabaseAdmin
      .from('favorites')
      .insert([{ profile_id: otherUserId, post_id: postData!.id }]);

    await page.goto('/analytics');

    const favoritesCard = page
      .locator('.analytics-stat-card')
      .filter({ hasText: 'Total Favorites' });
    await expect(favoritesCard.locator('.stat-value')).toHaveText('1');
  });
});

test.describe('Analytics page - unauthenticated', () => {
  test.beforeEach(async ({ page }) => {
    await clearSupabaseSession(page);
  });

  test('shows login prompt when not authenticated', async ({ page }) => {
    await page.goto('/analytics');

    await expect(page.getByText('log in')).toBeVisible();
    await expect(page.getByRole('link', { name: 'log in' })).toHaveAttribute('href', '/login');
  });
});

test.describe('Play tracking', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create a post by other user
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Play Tracking Test',
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

  test('records play event when stopping playback', async ({ page }) => {
    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    // Start playback
    const postItem = page.locator('.post-item').first();
    await postItem.locator('.post-expression').click();

    // Wait a bit for playback to register
    await page.waitForTimeout(2000);

    // Stop playback by clicking again
    await postItem.locator('.post-expression').click();

    // Wait for the play event to be recorded
    await page.waitForTimeout(500);

    // Check that a play event was created
    const { data: playEvents } = await supabaseAdmin
      .from('play_events')
      .select('*')
      .eq('post_id', testPostId);

    expect(playEvents).not.toBeNull();
    expect(playEvents!.length).toBeGreaterThanOrEqual(1);
    expect(playEvents![0].duration_seconds).toBeGreaterThanOrEqual(1);
  });

  test('records play event with user id when authenticated', async ({ page }) => {
    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    // Start playback
    await page.locator('.post-item .post-expression').click();
    await page.waitForTimeout(1500);

    // Stop playback
    await page.locator('.post-item .post-expression').click();
    await page.waitForTimeout(500);

    // Check play event has user id
    const { data: playEvents } = await supabaseAdmin
      .from('play_events')
      .select('*')
      .eq('post_id', testPostId);

    expect(playEvents).not.toBeNull();
    expect(playEvents!.length).toBeGreaterThanOrEqual(1);
    expect(playEvents![0].profile_id).toBe(testUserId);
  });

  test('records play event when switching to another post', async ({ page }) => {
    // Create a second post
    await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Second Post',
        expression: 't * 2',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(2, { timeout: 10000 });

    // Start playing first post
    await page.locator('.post-item').first().locator('.post-expression').click();
    await page.waitForTimeout(1500);

    // Switch to second post (should record play event for first)
    await page.locator('.post-item').nth(1).locator('.post-expression').click();
    await page.waitForTimeout(500);

    // Check that play event was recorded for first post
    const { data: playEvents } = await supabaseAdmin
      .from('play_events')
      .select('*')
      .order('created_at', { ascending: false });

    expect(playEvents).not.toBeNull();
    expect(playEvents!.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Play tracking - anonymous', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Anonymous Play Test',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    testPostId = data!.id;

    await clearSupabaseSession(page);
  });

  test('records play event without user id when anonymous', async ({ page }) => {
    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    // Start playback
    await page.locator('.post-item .post-expression').click();
    await page.waitForTimeout(1500);

    // Stop playback
    await page.locator('.post-item .post-expression').click();
    await page.waitForTimeout(500);

    // Check play event has null profile_id
    const { data: playEvents } = await supabaseAdmin
      .from('play_events')
      .select('*')
      .eq('post_id', testPostId);

    expect(playEvents).not.toBeNull();
    expect(playEvents!.length).toBeGreaterThanOrEqual(1);
    expect(playEvents![0].profile_id).toBeNull();
  });
});
