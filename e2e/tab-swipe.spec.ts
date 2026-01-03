import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+tabswipe@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_tabswipe_user';

const OTHER_USER_EMAIL = 'e2e+tabswipe_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_tabswipe_other';

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

  // Clean up test posts
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', otherUserId);

  // Clean up favorites
  await supabaseAdmin.from('favorites').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('favorites').delete().eq('profile_id', otherUserId);
});

test.describe('Tab swipe functionality', () => {
  test.describe('User profile page tabs', () => {
    test.beforeEach(async ({ page }) => {
      await signInAndInjectSession(page, {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      });
      await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

      // Create test posts
      await supabaseAdmin.from('posts').insert([
        {
          profile_id: testUserId,
          title: 'Test Post 1',
          expression: 't >> 3',
          is_draft: false,
          sample_rate: 8000,
          mode: 'uint8',
        },
        {
          profile_id: testUserId,
          title: 'Test Draft',
          expression: 't >> 4',
          is_draft: true,
          sample_rate: 8000,
          mode: 'uint8',
        },
      ]);
    });

    test('should switch tabs on click with optimistic UI', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForLoadState('networkidle');

      // Posts tab should be active by default
      await expect(page.locator('.tab-button.active').first()).toContainText('Posts');

      // Click Favorites tab
      await page.locator('.tab-button', { hasText: 'Favorites' }).click();

      // Tab should become active immediately (optimistic UI)
      await expect(page.locator('.tab-button.active')).toContainText('Favorites');

      // Content should load
      await expect(page.locator('text=This user has no public favorites yet.')).toBeVisible();
    });

    test('should show loading state when switching tabs', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForLoadState('networkidle');

      // Click Playlists tab
      await page.locator('.tab-button', { hasText: 'Playlists' }).click();

      // Should show loading or content (depending on timing)
      const hasLoading = await page
        .locator('text=Loading…')
        .isVisible()
        .catch(() => false);
      const hasContent = await page
        .locator('text=You have no playlists yet.')
        .isVisible()
        .catch(() => false);

      expect(hasLoading || hasContent).toBe(true);
    });

    test('should display drafts tab for own profile', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForLoadState('networkidle');

      // Drafts tab should be visible
      await expect(page.locator('.tab-button', { hasText: 'Drafts' })).toBeVisible();

      // Click Drafts tab
      await page.locator('.tab-button', { hasText: 'Drafts' }).click();

      // Should show draft post
      await expect(page.locator('text=Test Draft')).toBeVisible();
    });

    test('should not display drafts tab for other user profile', async ({ page }) => {
      await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

      await page.goto(`/u/${OTHER_USERNAME}`);
      await page.waitForLoadState('networkidle');

      // Drafts tab should not be visible
      await expect(page.locator('.tab-button', { hasText: 'Drafts' })).not.toBeVisible();
    });

    test('should persist tab selection in URL', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForLoadState('networkidle');

      // Click Favorites tab
      await page.locator('.tab-button', { hasText: 'Favorites' }).click();

      // URL should update
      await expect(page).toHaveURL(/tab=favorites/);

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Favorites tab should still be active
      await expect(page.locator('.tab-button.active')).toContainText('Favorites');
    });
  });

  test.describe('Post detail page tabs', () => {
    let postId: string;

    test.beforeEach(async ({ page }) => {
      await signInAndInjectSession(page, {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      });
      await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

      // Create a test post
      const { data: post } = await supabaseAdmin
        .from('posts')
        .insert({
          profile_id: testUserId,
          title: 'Test Post for Detail',
          expression: 't >> 3',
          is_draft: false,
          sample_rate: 8000,
          mode: 'uint8',
        })
        .select()
        .single();

      postId = post!.id;
    });

    test('should switch between Comments, Playlists, and Lineage tabs', async ({ page }) => {
      await page.goto(`/post/${postId}`);
      await page.waitForLoadState('networkidle');

      // Comments tab should be active by default
      await expect(page.locator('.tab-button.active').first()).toContainText('Comments');

      // Click Playlists tab
      await page.locator('.tab-button', { hasText: 'Playlists' }).click();
      await expect(page.locator('.tab-button.active')).toContainText('Playlists');

      // Click Lineage tab
      await page.locator('.tab-button', { hasText: 'Lineage' }).click();
      await expect(page.locator('.tab-button.active')).toContainText('Lineage');

      // Click back to Comments
      await page.locator('.tab-button', { hasText: 'Comments' }).click();
      await expect(page.locator('.tab-button.active')).toContainText('Comments');
    });

    test('should show comment count in tab label', async ({ page }) => {
      await page.goto(`/post/${postId}`);
      await page.waitForLoadState('networkidle');

      // Should show Comments (0) initially
      await expect(page.locator('.tab-button', { hasText: 'Comments' })).toContainText('(0)');
    });
  });

  test.describe('Explore page tabs', () => {
    test.beforeEach(async ({ page }) => {
      await signInAndInjectSession(page, {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      });
      await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    });

    test('should switch between Feed, Recent, and Weekly tabs', async ({ page }) => {
      await page.goto('/explore');
      await page.waitForLoadState('networkidle');

      // Feed tab should be active by default
      await expect(page.locator('.tab-button.active').first()).toContainText('Feed');

      // Click Recent tab
      await page.locator('.tab-button', { hasText: 'Recent' }).click();
      await expect(page.locator('.tab-button.active')).toContainText('Recent');

      // URL should update
      await expect(page).toHaveURL(/tab=recent/);
    });

    test('should persist tab selection in URL on explore page', async ({ page }) => {
      await page.goto('/explore?tab=recent');
      await page.waitForLoadState('networkidle');

      // Recent tab should be active
      await expect(page.locator('.tab-button.active')).toContainText('Recent');
    });
  });

  test.describe('Tag page tabs', () => {
    test.beforeEach(async ({ page }) => {
      await signInAndInjectSession(page, {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      });
      await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

      // Create a test post with a tag
      await supabaseAdmin.from('posts').insert({
        profile_id: testUserId,
        title: 'Test Post with Tag',
        expression: 't >> 3',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
        description: 'Test post #testtag',
      });
    });

    test('should switch between Recent and Trending tabs', async ({ page }) => {
      await page.goto('/tags/testtag');
      await page.waitForLoadState('networkidle');

      // Recent tab should be active by default
      await expect(page.locator('.tab-button.active').first()).toContainText('Recent');

      // Click Trending tab
      await page.locator('.tab-button', { hasText: 'Trending' }).click();
      await expect(page.locator('.tab-button.active')).toContainText('Trending');

      // URL should update
      await expect(page).toHaveURL(/tab=trending/);
    });
  });

  test.describe('Tab animations and transitions', () => {
    test.beforeEach(async ({ page }) => {
      await signInAndInjectSession(page, {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      });
      await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    });

    test('should not show horizontal scrollbar during tab switch', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForLoadState('networkidle');

      // Get the tab content wrapper - it's the parent of the tab-header
      const wrapper = page.locator('.tab-header').locator('..');

      // Click Favorites tab
      await page.locator('.tab-button', { hasText: 'Favorites' }).click();

      // Check that overflow-x is hidden
      await expect(wrapper).toHaveCSS('overflow-x', 'hidden');
    });

    test('should apply active styling to tab buttons', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForLoadState('networkidle');

      const activeTab = page.locator('.tab-button.active').first();

      // Active tab should have the active class
      await expect(activeTab).toHaveClass(/active/);

      // Click another tab
      await page.locator('.tab-button', { hasText: 'Favorites' }).click();

      // New tab should be active
      await expect(page.locator('.tab-button', { hasText: 'Favorites' })).toHaveClass(/active/);

      // Old tab should not be active
      await expect(page.locator('.tab-button', { hasText: 'Posts' })).not.toHaveClass(/active/);
    });
  });
});
