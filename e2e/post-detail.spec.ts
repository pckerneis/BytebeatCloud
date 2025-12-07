import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+postdetail@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_postdetail_user';

const OTHER_USER_EMAIL = 'e2e+postdetail_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_other_user';

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
});

test.describe('Post detail page - viewing', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    // Create a test post
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Test Post Title',
        description: 'This is a test description with #music and #bytebeat tags',
        expression: 't >> 4',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    testPostId = data!.id;

    await clearSupabaseSession(page);
  });

  test('displays post details correctly', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    // Wait for loading to finish
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify title is displayed
    await expect(page.getByRole('link', { name: 'Test Post Title' })).toBeVisible();

    // Verify author is displayed
    await expect(page.getByRole('link', { name: '@e2e_postdetail_user' })).toBeVisible();

    // Verify description with tags is displayed
    const description = page.locator('.post-description-detail');
    await expect(description).toBeVisible();
    await expect(description).toContainText('This is a test description');

    // Verify tags in description are clickable links
    await expect(description.getByRole('link', { name: '#music' })).toBeVisible();
    await expect(description.getByRole('link', { name: '#bytebeat' })).toBeVisible();

    // Verify mode and sample rate chips
    await expect(page.locator('.chip.mode')).toHaveText('uint8');
    await expect(page.locator('.chip.sample-rate')).toHaveText('8kHz');
  });

  test('shows back button that navigates back', async ({ page }) => {
    // Start from explore page
    await page.goto('/explore?tab=recent');
    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    // Navigate to post detail
    await page.getByRole('link', { name: 'Test Post Title' }).click();
    await page.waitForURL(/\/post\//);

    // Click back button
    await page.getByRole('button', { name: '← Back' }).click();

    // Should be back on explore
    await expect(page).toHaveURL(/\/explore/);
  });

  test('shows forks section', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Forks section should be visible
    await expect(page.getByRole('heading', { name: 'Forks' })).toBeVisible();
    await expect(page.getByText('No forks yet.')).toBeVisible();
  });

  test('shows error for non-existent post', async ({ page }) => {
    await page.goto('/post/00000000-0000-0000-0000-000000000000');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText('Post not found.')).toBeVisible();
  });

  test('displays mentions as clickable links', async ({ page }) => {
    // Create another user to mention
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create a post with a mention (stored format uses @[userId])
    const { data: mentionPost } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Post With Mention',
        description: `Check out @[${otherUserId}] for more!`,
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await page.goto(`/post/${mentionPost!.id}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify mention is rendered with username and is a clickable link
    const description = page.locator('.post-description-detail');
    const mentionLink = description.getByRole('link', { name: `@${OTHER_USERNAME}` });
    await expect(mentionLink).toBeVisible();

    // Click the mention link
    await mentionLink.click();

    // Should navigate to user profile
    await page.waitForURL(`/u/${OTHER_USERNAME}`);
  });
});

test.describe('Post detail page - playback', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Playback Test Post',
        expression: 't * 2',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    testPostId = data!.id;

    await clearSupabaseSession(page);
  });

  test('can play post from detail page', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click on expression to play
    const postItem = page.locator('.post-item').first();
    await postItem.locator('.post-expression').click();

    // Verify playback started
    const footerPlayButton = page.locator('.transport-button.play');
    await expect(footerPlayButton).toHaveClass(/playing/);

    // Footer shows post info
    await expect(page.locator('.played-post-name-text')).toHaveText('Playback Test Post');
  });

  test('can stop playback from footer', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Start playback
    const postItem = page.locator('.post-item').first();
    await postItem.locator('.post-expression').click();

    const footerPlayButton = page.locator('.transport-button.play');
    await expect(footerPlayButton).toHaveClass(/playing/);

    // Stop from footer
    await footerPlayButton.click();
    await expect(footerPlayButton).toHaveClass(/pause/);
  });
});

test.describe('Post detail page - fork button', () => {
  let testPostId: string;

  test.beforeEach(async () => {
    // Create post by other user
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Original Post',
        expression: 't >> 2',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    testPostId = data!.id;
  });

  test('shows fork button for other users post', async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Should show Fork link, not Edit
    await expect(page.getByRole('link', { name: 'Fork' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  });

  test('fork button navigates to fork page', async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await page.getByRole('link', { name: 'Fork' }).click();

    await page.waitForURL(/\/fork\//);
    await expect(page.getByRole('heading', { name: 'Fork' })).toBeVisible();
  });

  test('shows edit button for own post', async ({ page }) => {
    // Create post by test user
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'My Own Post',
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

    await page.goto(`/post/${data!.id}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Should show Edit link, not Fork
    await expect(page.getByRole('link', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Fork' })).toHaveCount(0);
  });
});

test.describe('Post detail page - favorites', () => {
  let testPostId: string;

  test.beforeEach(async () => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Favorite Test Post',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    testPostId = data!.id;
  });

  test('can favorite and unfavorite a post', async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const favoriteButton = page.locator('.post-item .favorite-button');
    const favoriteCount = favoriteButton.locator('.favorite-count');

    // Initial state: not favorited, count 0
    await expect(favoriteButton).not.toHaveClass(/favorited/);
    await expect(favoriteCount).toHaveText('0');

    // Click to favorite
    await favoriteButton.click();

    // Should now be favorited with count 1
    await expect(favoriteButton).toHaveClass(/favorited/);
    await expect(favoriteCount).toHaveText('1');

    // Click to unfavorite
    await favoriteButton.click();

    // Should be unfavorited with count 0
    await expect(favoriteButton).not.toHaveClass(/favorited/);
    await expect(favoriteCount).toHaveText('0');
  });

  test('unauthenticated user clicking favorite redirects to login', async ({ page }) => {
    await clearSupabaseSession(page);

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const favoriteButton = page.locator('.post-item .favorite-button');
    await favoriteButton.click();

    await page.waitForURL('/login');
  });
});
