import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+favorites@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_favorites_user';

const OTHER_USER_EMAIL = 'e2e+favorites_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_favorites_other';

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

  // Clean up test posts and favorites
  await supabaseAdmin.from('favorites').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('favorites').delete().eq('profile_id', otherUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', otherUserId);
});

test.describe('Favorites - from post list', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create a post by other user
    const { data } = await supabaseAdmin
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

    testPostId = data!.id;

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('can favorite a post from explore page', async ({ page }) => {
    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    const favoriteButton = page.locator('.post-item .favorite-button');
    const favoriteCount = favoriteButton.locator('.favorite-count');

    // Initial state
    await expect(favoriteButton).not.toHaveClass(/favorited/);
    await expect(favoriteCount).toHaveText('0');

    // Favorite
    await favoriteButton.click();

    await expect(favoriteButton).toHaveClass(/favorited/);
    await expect(favoriteCount).toHaveText('1');
  });

  test('can unfavorite a post from explore page', async ({ page }) => {
    // Pre-favorite the post
    await supabaseAdmin.from('favorites').insert({
      profile_id: testUserId,
      post_id: testPostId,
    });

    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    const favoriteButton = page.locator('.post-item .favorite-button');
    const favoriteCount = favoriteButton.locator('.favorite-count');

    // Initial state - already favorited
    await expect(favoriteButton).toHaveClass(/favorited/);
    await expect(favoriteCount).toHaveText('1');

    // Unfavorite
    await favoriteButton.click();

    await expect(favoriteButton).not.toHaveClass(/favorited/);
    await expect(favoriteCount).toHaveText('0');
  });

  test('favorite count updates correctly', async ({ page }) => {
    // Add some existing favorites from other user
    await supabaseAdmin.from('favorites').insert({
      profile_id: otherUserId,
      post_id: testPostId,
    });

    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    const favoriteButton = page.locator('.post-item .favorite-button');
    const favoriteCount = favoriteButton.locator('.favorite-count');

    // Should show 1 (from other user)
    await expect(favoriteCount).toHaveText('1');

    // Favorite - should become 2
    await favoriteButton.click();
    await expect(favoriteCount).toHaveText('2');

    // Unfavorite - should go back to 1
    await favoriteButton.click();
    await expect(favoriteCount).toHaveText('1');
  });
});

test.describe('Favorites - from post detail page', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Detail Page Favorite Test',
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

  test('can favorite from post detail page', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const favoriteButton = page.locator('.post-item .favorite-button');

    await expect(favoriteButton).not.toHaveClass(/favorited/);

    await favoriteButton.click();

    await expect(favoriteButton).toHaveClass(/favorited/);
  });
});

test.describe('Favorites - from footer player', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Footer Favorite Test',
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

  test('can favorite from footer when post is playing', async ({ page }) => {
    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    // Start playback
    const postItem = page.locator('.post-item').first();
    await postItem.locator('.post-expression').click();

    // Wait for footer to show the post
    await expect(page.locator('.played-post-name-text')).toHaveText('Footer Favorite Test');

    // Footer favorite button
    const footerFavoriteButton = page.locator('.footer .favorite-button');

    await expect(footerFavoriteButton).not.toHaveClass(/favorited/);

    // Favorite from footer
    await footerFavoriteButton.click();

    await expect(footerFavoriteButton).toHaveClass(/favorited/);

    // Post list should also update
    const postListFavoriteButton = page.locator('.post-item .favorite-button');
    await expect(postListFavoriteButton).toHaveClass(/favorited/);
  });

  test('footer favorite button is disabled when no post is playing', async ({ page }) => {
    await page.goto('/explore?tab=recent');

    const footerFavoriteButton = page.locator('.footer .favorite-button');

    await expect(footerFavoriteButton).toBeDisabled();
  });
});

test.describe('Favorites - appears in profile favorites tab', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post For Favorites Tab',
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

  test('favorited post appears in profile favorites tab', async ({ page }) => {
    // Favorite the post
    await page.goto('/explore?tab=recent');
    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    await page.locator('.post-item .favorite-button').click();
    await expect(page.locator('.post-item .favorite-button')).toHaveClass(/favorited/);

    // Go to profile favorites tab
    await page.goto('/profile?tab=favorites');

    // Should show the favorited post
    await expect(page.getByRole('link', { name: 'Post For Favorites Tab' })).toBeVisible();
  });

  test('unfavorited post disappears from profile favorites tab', async ({ page }) => {
    // Pre-favorite the post
    await supabaseAdmin.from('favorites').insert({
      profile_id: testUserId,
      post_id: testPostId,
    });

    // Verify it's in favorites
    await page.goto('/profile?tab=favorites');
    await expect(page.getByRole('link', { name: 'Post For Favorites Tab' })).toBeVisible();

    // Unfavorite from the favorites tab
    await page.locator('.post-item .favorite-button').click();

    // Post should disappear (or show empty message after refresh)
    await page.reload();
    await expect(page.getByText('This user has no public favorites yet.')).toBeVisible();
  });
});

test.describe('Favorites - unauthenticated', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Unauth Favorite Test',
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

  test('clicking favorite redirects to login', async ({ page }) => {
    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    const favoriteButton = page.locator('.post-item .favorite-button');
    await favoriteButton.click();

    await page.waitForURL('/login');
  });

  test('clicking favorite on post detail redirects to login', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const favoriteButton = page.locator('.post-item .favorite-button');
    await favoriteButton.click();

    await page.waitForURL('/login');
  });
});

test.describe('Favorites - own post', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
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
  });

  test('can favorite own post', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    const favoriteButton = page.locator('.post-item .favorite-button');

    await expect(favoriteButton).not.toHaveClass(/favorited/);

    await favoriteButton.click();

    await expect(favoriteButton).toHaveClass(/favorited/);
  });
});
