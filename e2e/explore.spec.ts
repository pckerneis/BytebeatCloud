import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+explore@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_explore_user';

let testUserId: string;

test.beforeAll(async () => {
  const user = await ensureTestUser({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  testUserId = user.id;
});

test.beforeEach(async () => {
  await clearProfilesTable();

  // Clean up any test posts
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
});

test.describe('Explore page - play controls', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    // Create a test post for playback tests
    await supabaseAdmin.from('posts').insert({
      profile_id: testUserId,
      title: 'E2E Playback Test',
      expression: 't >> 3',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    });
  });

  test('clicking play button on post item starts playback', async ({ page }) => {
    await page.goto('/explore?tab=recent');

    // Wait for posts to load
    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    // Find the play button overlay on the post expression
    const postItem = page.locator('.post-item').first();
    const playButton = postItem.locator('.post-expression-play-button');

    // Hover to reveal play button
    await postItem.locator('.post-expression').hover();
    await expect(playButton).toBeVisible();

    // Click play
    await playButton.click();

    // Verify footer transport shows playing state
    const footerPlayButton = page.locator('.transport-button.play');
    await expect(footerPlayButton).toHaveClass(/playing/);

    // Verify post item has playing class
    await expect(postItem).toHaveClass(/playing/);

    // Verify footer shows the post info
    await expect(page.locator('.played-post-name-text')).toHaveText('E2E Playback Test');
    await expect(page.locator('.played-post-author')).toHaveText('@e2e_explore_user');
  });

  test('clicking stop button on footer transport stops playback', async ({ page }) => {
    await page.goto('/explore?tab=recent');

    // Wait for posts to load
    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    // Start playback from post item
    const postItem = page.locator('.post-item').first();
    await postItem.locator('.post-expression').hover();
    await postItem.locator('.post-expression-play-button').click();

    // Verify playing
    const footerPlayButton = page.locator('.transport-button.play');
    await expect(footerPlayButton).toHaveClass(/playing/);

    // Click footer play/pause button to stop
    await footerPlayButton.click();

    // Verify stopped (button should show pause class, not playing)
    await expect(footerPlayButton).toHaveClass(/pause/);
    await expect(footerPlayButton).not.toHaveClass(/playing/);

    // Post item should no longer have playing class
    await expect(postItem).not.toHaveClass(/playing/);
  });

  test('clicking play on footer transport resumes playback', async ({ page }) => {
    await page.goto('/explore?tab=recent');

    // Wait for posts to load
    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    // Start playback
    const postItem = page.locator('.post-item').first();
    await postItem.locator('.post-expression').hover();
    await postItem.locator('.post-expression-play-button').click();

    const footerPlayButton = page.locator('.transport-button.play');
    await expect(footerPlayButton).toHaveClass(/playing/);

    // Stop playback
    await footerPlayButton.click();
    await expect(footerPlayButton).toHaveClass(/pause/);

    // Resume playback from footer
    await footerPlayButton.click();
    await expect(footerPlayButton).toHaveClass(/playing/);
    await expect(postItem).toHaveClass(/playing/);
  });

  test('clicking expression area on post item starts playback', async ({ page }) => {
    await page.goto('/explore?tab=recent');

    // Wait for posts to load
    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    // Click directly on the expression area (not the play button)
    const postItem = page.locator('.post-item').first();
    await postItem.locator('.post-expression').click();

    // Verify playback started
    const footerPlayButton = page.locator('.transport-button.play');
    await expect(footerPlayButton).toHaveClass(/playing/);
    await expect(postItem).toHaveClass(/playing/);
  });

  test('footer shows post info when playing', async ({ page }) => {
    await page.goto('/explore?tab=recent');

    // Initially footer should show placeholder
    await expect(page.locator('.played-post-name-text')).toHaveText('-');
    await expect(page.locator('.played-post-author')).toHaveText('-');

    // Wait for posts to load and start playback
    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });
    const postItem = page.locator('.post-item').first();
    await postItem.locator('.post-expression').click();

    // Footer should now show post info
    await expect(page.locator('.played-post-name-text')).toHaveText('E2E Playback Test');
    await expect(page.locator('.played-post-author')).toHaveText('@e2e_explore_user');
  });
});

test.describe('Explore page - tabs', () => {
  test.beforeEach(async ({ page }) => {
    await clearSupabaseSession(page);
  });

  test('can switch between feed, recent, and weekly tabs', async ({ page }) => {
    await page.goto('/explore');

    // Default tab should be feed
    await expect(page.locator('.tab-button.active')).toHaveText('Feed');

    // Click Recent tab
    await page.locator('.tab-button', { hasText: 'Recent' }).click();
    await expect(page.locator('.tab-button.active')).toHaveText('Recent');
    await expect(page).toHaveURL(/tab=recent/);

    // Click Trending tab
    await page.locator('.tab-button', { hasText: 'Weekly Challenge' }).click();
    await expect(page.locator('.tab-button.active')).toHaveText('Weekly Challenge');
    await expect(page).toHaveURL(/tab=weekly/);

    // Click Feed tab
    await page.locator('.tab-button', { hasText: 'Feed' }).click();
    await expect(page.locator('.tab-button.active')).toHaveText('Feed');
    await expect(page).toHaveURL(/tab=feed/);
  });

  test('tab state persists in URL', async ({ page }) => {
    // Navigate directly to recent tab
    await page.goto('/explore?tab=recent');
    await expect(page.locator('.tab-button.active')).toHaveText('Recent');

    // Navigate directly to trending tab
    await page.goto('/explore?tab=trending');
    await expect(page.locator('.tab-button.active')).toHaveText('Trending');
  });
});
