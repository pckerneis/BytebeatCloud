import { test, expect } from '@playwright/test';
import { ensureTestUser, ensureTestUserProfile, supabaseAdmin } from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+playqueue@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_queue_user';

async function createTestPost(params: { userId: string; title: string; expression: string }) {
  const { data, error } = await supabaseAdmin
    .from('posts')
    .insert({
      profile_id: params.userId,
      title: params.title,
      expression: params.expression,
      mode: 'uint8',
      sample_rate: 8000,
      is_draft: false,
    })
    .select('id')
    .single();

  expect(error).toBeNull();
  return data!.id as string;
}

test.describe('Play Queue', () => {
  let testUserId: string;

  test.beforeAll(async () => {
    const user = await ensureTestUser({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
    testUserId = user.id;
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test.beforeEach(async ({ page }) => {
    await clearSupabaseSession(page);
    await signInAndInjectSession(page, { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  });

  test.afterEach(async ({ page }) => {
    await clearSupabaseSession(page);
  });

  test('should toggle queue visibility when clicking queue button', async ({ page }) => {
    // Create test posts
    const postId1 = await createTestPost({
      userId: testUserId,
      title: 'Queue Test Post 1',
      expression: 't',
    });
    const postId2 = await createTestPost({
      userId: testUserId,
      title: 'Queue Test Post 2',
      expression: 't*2',
    });

    await page.goto('/explore');
    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Play first post to populate queue
    const firstPlayButton = page.locator('.post-item').first().getByText('▶');
    await firstPlayButton.click();
    await page.waitForTimeout(500);

    // Queue should be hidden initially
    await expect(page.locator('.play-queue-container')).not.toBeVisible();

    // Click queue button
    const queueButton = page.getByRole('button', { name: '▤' });
    await queueButton.click();

    // Queue should now be visible
    await expect(page.locator('.play-queue-container')).toBeVisible();
    await expect(page.locator('.play-queue-title')).toContainText('Play Queue');

    // Click queue button again to close
    await queueButton.click();
    await expect(page.locator('.play-queue-container')).not.toBeVisible();

    // Cleanup
    await supabaseAdmin.from('posts').delete().eq('id', postId1);
    await supabaseAdmin.from('posts').delete().eq('id', postId2);
  });

  test('should display all posts in queue when playing from post list', async ({ page }) => {
    // Create multiple test posts
    const postIds = [];
    for (let i = 1; i <= 3; i++) {
      const postId = await createTestPost({
        userId: testUserId,
        title: `Queue Item ${i}`,
        expression: `t*${i}`,
      });
      postIds.push(postId);
    }

    await page.goto('/explore');
    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Play first post
    const firstPlayButton = page.locator('.post-item').first().getByText('▶');
    await firstPlayButton.click();
    await page.waitForTimeout(500);

    // Open queue
    const queueButton = page.getByRole('button', { name: '▤' });
    await queueButton.click();

    // Verify queue contains items
    const queueItems = page.locator('.play-queue-item');
    await expect(queueItems).not.toHaveCount(0);

    // Verify first item is marked as current
    const currentItem = page.locator('.play-queue-item.current');
    await expect(currentItem).toBeVisible();

    // Cleanup
    for (const postId of postIds) {
      await supabaseAdmin.from('posts').delete().eq('id', postId);
    }
  });

  test('should remove item from queue when clicking remove button', async ({ page }) => {
    // Create test posts
    const postIds = [];
    for (let i = 1; i <= 3; i++) {
      const postId = await createTestPost({
        userId: testUserId,
        title: `Remove Test ${i}`,
        expression: `t*${i}`,
      });
      postIds.push(postId);
    }

    await page.goto('/');
    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Play first post
    const firstPost = page.locator('.post-item').first();
    await firstPost.locator('.post-expression').click();
    await page.waitForTimeout(500);

    // Open queue
    const queueButton = page.getByRole('button', { name: '▤' });
    await queueButton.click();

    // Get initial queue item count
    const initialCount = await page.locator('.play-queue-item').count();
    expect(initialCount).toBeGreaterThan(1);

    // Hover over second item and click remove button
    const secondItem = page.locator('.play-queue-item').nth(1);
    await secondItem.hover();
    const removeButton = secondItem.locator('.play-queue-item-remove');
    await removeButton.click();

    // Verify item was removed
    await expect(page.locator('.play-queue-item')).toHaveCount(initialCount - 1);

    // Cleanup
    for (const postId of postIds) {
      await supabaseAdmin.from('posts').delete().eq('id', postId);
    }
  });

  test('should play selected item when clicking queue item', async ({ page }) => {
    // Create test posts
    const postIds = [];
    for (let i = 1; i <= 3; i++) {
      const postId = await createTestPost({
        userId: testUserId,
        title: `Click Test ${i}`,
        expression: `t*${i}`,
      });
      postIds.push(postId);
    }

    await page.goto('/explore');
    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Play first post
    const firstPlayButton = page.locator('.post-item').first().getByText('▶');
    await firstPlayButton.click();
    await page.waitForTimeout(500);

    // Open queue
    const queueButton = page.getByRole('button', { name: '▤' });
    await queueButton.click();

    // Verify first item is current
    await expect(page.locator('.play-queue-item').first()).toHaveClass(/current/);

    // Click third item
    const thirdItem = page.locator('.play-queue-item').nth(2);
    await thirdItem.click();
    await page.waitForTimeout(500);

    // Verify third item is now current
    await expect(page.locator('.play-queue-item').nth(2)).toHaveClass(/current/);

    // Cleanup
    for (const postId of postIds) {
      await supabaseAdmin.from('posts').delete().eq('id', postId);
    }
  });

  test('should reorder queue items via drag and drop', async ({ page }) => {
    // Create test posts
    const postIds = [];
    for (let i = 1; i <= 3; i++) {
      const postId = await createTestPost({
        userId: testUserId,
        title: `Drag Test ${i}`,
        expression: `t*${i}`,
      });
      postIds.push(postId);
    }

    await page.goto('/');
    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Play first post
    const firstPost = page.locator('.post-item').first();
    await firstPost.locator('.post-expression').click();
    await page.waitForTimeout(500);

    // Open queue
    const queueButton = page.getByRole('button', { name: '▤' });
    await queueButton.click();

    // Get initial order
    const secondItemTitle = await page
      .locator('.play-queue-item')
      .nth(1)
      .locator('.play-queue-item-title')
      .textContent();

    // Drag first item to second position
    const firstItem = page.locator('.play-queue-item').first();
    const secondItem = page.locator('.play-queue-item').nth(1);

    await firstItem.dragTo(secondItem);
    await page.waitForTimeout(300);

    // Verify order changed
    const newFirstItemTitle = await page
      .locator('.play-queue-item')
      .first()
      .locator('.play-queue-item-title')
      .textContent();
    expect(newFirstItemTitle).toBe(secondItemTitle);

    // Cleanup
    for (const postId of postIds) {
      await supabaseAdmin.from('posts').delete().eq('id', postId);
    }
  });

  test('should toggle auto-skip mode', async ({ page }) => {
    // Create test posts
    const postIds = [];
    for (let i = 1; i <= 2; i++) {
      const postId = await createTestPost({
        userId: testUserId,
        title: `Auto Test ${i}`,
        expression: `t*${i}`,
      });
      postIds.push(postId);
    }

    await page.goto('/explore');
    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Play first post
    const firstPlayButton = page.locator('.post-item').first().getByText('▶');
    await firstPlayButton.click();
    await page.waitForTimeout(500);

    // Open queue
    const queueButton = page.getByRole('button', { name: '▤' });
    await queueButton.click();

    // Find auto-skip button
    const autoButton = page
      .locator('.play-queue-controls button')
      .filter({ hasText: /auto-skip/i });

    // Should not be active initially
    await expect(autoButton).not.toHaveClass(/active/);

    // Click to enable auto-skip
    await autoButton.click();
    await expect(autoButton).toHaveClass(/active/);

    // Progress bar should appear
    await expect(page.locator('.footer-progress')).toBeVisible();

    // Click to disable auto-skip
    await autoButton.click();
    await expect(autoButton).not.toHaveClass(/active/);

    // Cleanup
    for (const postId of postIds) {
      await supabaseAdmin.from('posts').delete().eq('id', postId);
    }
  });

  test('should shuffle queue when clicking shuffle button', async ({ page }) => {
    // Create test posts
    const postIds = [];
    for (let i = 1; i <= 4; i++) {
      const postId = await createTestPost({
        userId: testUserId,
        title: `Shuffle Test ${i}`,
        expression: `t*${i}`,
      });
      postIds.push(postId);
    }

    await page.goto('/');
    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Play first post
    const firstPost = page.locator('.post-item').first();
    await firstPost.locator('.post-expression').click();
    await page.waitForTimeout(500);

    // Open queue
    const queueButton = page.getByRole('button', { name: '▤' });
    await queueButton.click();

    // Get initial order (skip first item as it's current and won't move)
    const initialOrder = [];
    const items = await page.locator('.play-queue-item').all();
    for (let i = 1; i < Math.min(items.length, 4); i++) {
      const title = await items[i].locator('.play-queue-item-title').textContent();
      initialOrder.push(title);
    }

    // Click shuffle button
    const shuffleButton = page
      .locator('.play-queue-controls button')
      .filter({ hasText: /shuffle/i });
    await shuffleButton.click();
    await page.waitForTimeout(300);

    // Get new order
    const newOrder = [];
    const newItems = await page.locator('.play-queue-item').all();
    for (let i = 1; i < Math.min(newItems.length, 4); i++) {
      const title = await newItems[i].locator('.play-queue-item-title').textContent();
      newOrder.push(title);
    }

    // Verify order changed (with 4 items, there's a very high probability the order will be different)
    const orderChanged = JSON.stringify(initialOrder) !== JSON.stringify(newOrder);
    expect(orderChanged).toBe(true);

    // Cleanup
    for (const postId of postIds) {
      await supabaseAdmin.from('posts').delete().eq('id', postId);
    }
  });

  test('should favorite queue item when clicking favorite button', async ({ page }) => {
    // Create test post
    const postId = await createTestPost({
      userId: testUserId,
      title: 'Favorite Queue Test',
      expression: 't',
    });

    await page.goto('/explore');
    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Play post
    const firstPlayButton = page.locator('.post-item').first().getByText('▶');
    await firstPlayButton.click();
    await page.waitForTimeout(500);

    // Open queue
    const queueButton = page.getByRole('button', { name: '▤' });
    await queueButton.click();

    // Hover over queue item to reveal favorite button
    const queueItem = page.locator('.play-queue-item').first();
    await queueItem.hover();

    // Click favorite button
    const favoriteButton = queueItem.locator('.play-queue-item-favorite');
    await favoriteButton.click();
    await page.waitForTimeout(500);

    // Verify button shows favorited state
    await expect(favoriteButton).toHaveClass(/favorited/);

    // Click again to unfavorite
    await favoriteButton.click();
    await page.waitForTimeout(500);
    await expect(favoriteButton).not.toHaveClass(/favorited/);

    // Cleanup
    await supabaseAdmin.from('posts').delete().eq('id', postId);
  });

  test('should close queue when clicking close button', async ({ page }) => {
    // Create test post
    const postId = await createTestPost({
      userId: testUserId,
      title: 'Close Test',
      expression: 't',
    });

    await page.goto('/explore');
    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Play post
    const firstPlayButton = page.locator('.post-item').first().getByText('▶');
    await firstPlayButton.click();
    await page.waitForTimeout(500);

    // Open queue
    const queueButton = page.getByRole('button', { name: '▤' });
    await queueButton.click();
    await expect(page.locator('.play-queue-container')).toBeVisible();

    // Click close button
    const closeButton = page.locator('.play-queue-close');
    await closeButton.click();

    // Queue should be hidden
    await expect(page.locator('.play-queue-container')).not.toBeVisible();

    // Cleanup
    await supabaseAdmin.from('posts').delete().eq('id', postId);
  });
});
