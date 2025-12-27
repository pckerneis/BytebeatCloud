import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+backtotop@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_backtotop_user';

let testUserId: string;

test.beforeAll(async () => {
  const user = await ensureTestUser({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  testUserId = user.id;
});

test.beforeEach(async () => {
  await clearProfilesTable();
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
});

// Helper to create multiple posts for scrolling
async function createPosts(count: number) {
  const posts = [];
  for (let i = 0; i < count; i++) {
    posts.push({
      profile_id: testUserId,
      title: `Back to Top Test Post ${i + 1}`,
      expression: `t >> ${i % 8}`,
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    });
  }
  await supabaseAdmin.from('posts').insert(posts);
}

test.describe('Back to top button', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await clearSupabaseSession(page);
  });

  test('button is hidden initially when at top of page', async ({ page }) => {
    await createPosts(5);
    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(5, { timeout: 10000 });

    const backToTopButton = page.locator('.back-to-top-button');
    await expect(backToTopButton).not.toHaveClass(/visible/);
  });

  test('button becomes visible after scrolling down', async ({ page }) => {
    await createPosts(30);
    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(20, { timeout: 10000 });

    const backToTopButton = page.locator('.back-to-top-button');

    // Initially hidden
    await expect(backToTopButton).not.toHaveClass(/visible/);

    // Scroll down significantly (the button appears after scrolling 1000px)
    const main = page.locator('main');
    await main.evaluate((el) => {
      el.scrollTo({ top: 1500 });
    });

    // Button should now be visible
    await expect(backToTopButton).toHaveClass(/visible/);
  });

  test('clicking button scrolls back to top', async ({ page }) => {
    await createPosts(30);
    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(20, { timeout: 10000 });

    const backToTopButton = page.locator('.back-to-top-button');
    const main = page.locator('main');

    // Scroll down
    await main.evaluate((el) => {
      el.scrollTo({ top: 1500 });
    });

    // Wait for button to be visible
    await expect(backToTopButton).toHaveClass(/visible/);

    // Click the button
    await backToTopButton.click();

    // Verify we scrolled back to top
    const scrollTop = await main.evaluate((el) => el.scrollTop);
    expect(scrollTop).toBe(0);
  });

  test('button hides after scrolling back to top', async ({ page }) => {
    await createPosts(30);
    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(20, { timeout: 10000 });

    const backToTopButton = page.locator('.back-to-top-button');
    const main = page.locator('main');

    // Scroll down to make button visible
    await main.evaluate((el) => {
      el.scrollTo({ top: 1500 });
    });
    await expect(backToTopButton).toHaveClass(/visible/);

    // Click button to scroll to top
    await backToTopButton.click();

    // Wait a bit for scroll to complete and visibility to update
    await page.waitForTimeout(300);

    // Button should be hidden again
    await expect(backToTopButton).not.toHaveClass(/visible/);
  });

  test('button works on profile page', async ({ page }) => {
    await createPosts(30);
    await page.goto(`/u/${TEST_USERNAME}`);

    await expect(page.locator('.post-item')).toHaveCount(20, { timeout: 10000 });

    const backToTopButton = page.locator('.back-to-top-button');
    const main = page.locator('main');

    // Initially hidden
    await expect(backToTopButton).not.toHaveClass(/visible/);

    // Scroll down
    await main.evaluate((el) => {
      el.scrollTo({ top: 1500 });
    });

    // Button should be visible
    await expect(backToTopButton).toHaveClass(/visible/);

    // Click to scroll back
    await backToTopButton.click();

    // Verify scroll position
    const scrollTop = await main.evaluate((el) => el.scrollTop);
    expect(scrollTop).toBe(0);
  });

  test('button works on tag page', async ({ page }) => {
    // Create posts with a tag
    const posts = [];
    for (let i = 0; i < 30; i++) {
      posts.push({
        profile_id: testUserId,
        title: `Tagged Post ${i + 1}`,
        description: '#testscroll',
        expression: `t >> ${i % 8}`,
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      });
    }
    await supabaseAdmin.from('posts').insert(posts);

    await page.goto('/tags/testscroll');

    await expect(page.locator('.post-item')).toHaveCount(20, { timeout: 10000 });

    const backToTopButton = page.locator('.back-to-top-button');
    const main = page.locator('main');

    // Scroll down
    await main.evaluate((el) => {
      el.scrollTo({ top: 1500 });
    });

    // Button should be visible
    await expect(backToTopButton).toHaveClass(/visible/);

    // Click to scroll back
    await backToTopButton.click();

    // Verify scroll position
    const scrollTop = await main.evaluate((el) => el.scrollTop);
    expect(scrollTop).toBe(0);
  });
});
