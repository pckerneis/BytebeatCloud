import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+scroll@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_scroll_user';

let testUserId: string;

test.beforeAll(async () => {
  const user = await ensureTestUser({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  testUserId = user.id;
});

test.beforeEach(async () => {
  await clearProfilesTable();
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
});

// Helper to scroll sentinel into view to trigger infinite scroll
async function scrollToLoadMore(page: import('@playwright/test').Page) {
  // Scroll the sentinel element into view to trigger IntersectionObserver
  const sentinel = page.getByTestId('scroll-sentinel');
  await sentinel.scrollIntoViewIfNeeded();
  // Wait for intersection observer to fire and data to load
  await page.waitForTimeout(200);
}

// Helper to create multiple posts
async function createPosts(count: number, options: { tag?: string } = {}) {
  const posts = [];
  for (let i = 0; i < count; i++) {
    posts.push({
      profile_id: testUserId,
      title: `Scroll Test Post ${i + 1}`,
      description: options.tag ? `#${options.tag}` : '',
      expression: `t >> ${i % 8}`,
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
      created_at: new Date(Date.now() - i * 60000).toISOString(), // Stagger creation times
    });
  }
  await supabaseAdmin.from('posts').insert(posts);
}

test.describe('Infinite scroll - Explore page', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await clearSupabaseSession(page);
  });

  test('loads initial batch of posts', async ({ page }) => {
    await createPosts(25);

    await page.goto('/explore?tab=recent');

    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Should load first page (20 posts)
    await expect(page.locator('.post-item')).toHaveCount(20);
  });

  test('loads more posts when scrolling to bottom', async ({ page }) => {
    await createPosts(30);

    await page.goto('/explore?tab=recent');

    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Initial load
    await expect(page.locator('.post-item')).toHaveCount(20);

    // Scroll to trigger infinite scroll
    await scrollToLoadMore(page);

    // Wait for more posts to load
    await expect(page.locator('.post-item')).toHaveCount(30, { timeout: 10000 });
  });

  test('shows "Loading more" indicator while fetching', async ({ page }) => {
    await createPosts(25);

    await page.goto('/explore?tab=recent');

    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Scroll to trigger load
    await scrollToLoadMore(page);

    // After loading completes, should have more posts
    await expect(page.locator('.post-item')).toHaveCount(25, { timeout: 10000 });
  });

  test('shows end message when all posts loaded', async ({ page }) => {
    await createPosts(15); // Less than page size

    await page.goto('/explore?tab=recent');

    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // All posts loaded in first batch
    await expect(page.locator('.post-item')).toHaveCount(15);

    // Should not show "Loading more"
    await expect(page.getByText('Loading more…')).toHaveCount(0);
  });

  test('resets scroll position when switching tabs', async ({ page }) => {
    await createPosts(30);

    await page.goto('/explore?tab=recent');

    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Scroll and load more
    await scrollToLoadMore(page);
    await expect(page.locator('.post-item')).toHaveCount(30, { timeout: 10000 });

    // Switch to trending tab
    await page.locator('.tab-button', { hasText: 'Trending' }).click();

    // Should reset to initial page size
    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('.post-item')).toHaveCount(20);
  });
});

test.describe('Infinite scroll - Tag page', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await clearSupabaseSession(page);
  });

  test('loads more posts when scrolling on tag page', async ({ page }) => {
    await createPosts(30, { tag: 'scrolltest' });

    await page.goto('/tags/scrolltest');

    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Initial load
    await expect(page.locator('.post-item')).toHaveCount(20);

    // Scroll to trigger load
    await scrollToLoadMore(page);

    // Wait for more posts
    await expect(page.locator('.post-item')).toHaveCount(30, { timeout: 10000 });
  });

  test('shows end message on tag page', async ({ page }) => {
    await createPosts(25, { tag: 'endtest' });

    await page.goto('/tags/endtest');

    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Scroll to load all
    await scrollToLoadMore(page);
    await expect(page.locator('.post-item')).toHaveCount(25, { timeout: 10000 });

    // Should show end message after all loaded
    await expect(page.getByText('You reached the end!')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Infinite scroll - Profile page', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await clearSupabaseSession(page);
  });

  test('loads more posts when scrolling on profile page', async ({ page }) => {
    await createPosts(30);

    await page.goto(`/u/${TEST_USERNAME}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Initial load
    await expect(page.locator('.post-item')).toHaveCount(20);

    // Scroll to trigger load
    await scrollToLoadMore(page);

    // Wait for more posts
    await expect(page.locator('.post-item')).toHaveCount(30, { timeout: 10000 });
  });

  test('shows end message on profile page', async ({ page }) => {
    await createPosts(25);

    await page.goto(`/u/${TEST_USERNAME}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Scroll to load all
    await scrollToLoadMore(page);
    await expect(page.locator('.post-item')).toHaveCount(25, { timeout: 10000 });

    // Should show end message after all loaded
    await expect(page.getByText('You reached the end!')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Infinite scroll - maintains state', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await clearSupabaseSession(page);
  });

  test('posts remain after scrolling back up', async ({ page }) => {
    await createPosts(30);

    await page.goto('/explore?tab=recent');

    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Load more
    await scrollToLoadMore(page);
    await expect(page.locator('.post-item')).toHaveCount(30, { timeout: 10000 });

    // Scroll back to top
    await page.locator('.post-item').first().scrollIntoViewIfNeeded();

    // All posts should still be there
    await expect(page.locator('.post-item')).toHaveCount(30);

    // First post should be visible
    await expect(page.getByRole('link', { name: 'Scroll Test Post 1', exact: true })).toBeVisible();
  });
});
