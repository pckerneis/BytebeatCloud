import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+profile@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_profile_user';

const OTHER_USER_EMAIL = 'e2e+profile_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_other_profile';

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

test.describe('Own profile page (/profile)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('displays username and edit button', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.getByRole('heading', { name: `@${TEST_USERNAME}` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  });

  test('shows posts, drafts, and favorites tabs', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.locator('.tab-button', { hasText: 'Posts' })).toBeVisible();
    await expect(page.locator('.tab-button', { hasText: 'Drafts' })).toBeVisible();
    await expect(page.locator('.tab-button', { hasText: 'Favorites' })).toBeVisible();
  });

  test('does not show follow button on own profile', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.getByRole('button', { name: 'Follow' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Followed' })).toHaveCount(0);
  });

  test('can switch between tabs', async ({ page }) => {
    await page.goto('/profile');

    // Default is posts tab
    await expect(page.locator('.tab-button.active')).toHaveText('Posts');

    // Switch to drafts
    await page.locator('.tab-button', { hasText: 'Drafts' }).click();
    await expect(page.locator('.tab-button.active')).toHaveText('Drafts');
    await expect(page).toHaveURL(/tab=drafts/);

    // Switch to favorites
    await page.locator('.tab-button', { hasText: 'Favorites' }).click();
    await expect(page.locator('.tab-button.active')).toHaveText('Favorites');
    await expect(page).toHaveURL(/tab=favorites/);

    // Switch back to posts
    await page.locator('.tab-button', { hasText: 'Posts' }).click();
    await expect(page.locator('.tab-button.active')).toHaveText('Posts');
    await expect(page).toHaveURL(/tab=posts/);
  });

  test('edit button navigates to update-profile page', async ({ page }) => {
    await page.goto('/profile');

    await page.getByRole('button', { name: 'Edit' }).click();

    await page.waitForURL('/update-profile');
  });
});

test.describe('Own profile - posts tab', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('shows empty message when no posts', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.getByText('This user has no public posts yet.')).toBeVisible();
  });

  test('shows user posts', async ({ page }) => {
    // Create a post
    await supabaseAdmin.from('posts').insert({
      profile_id: testUserId,
      title: 'My Public Post',
      expression: 't',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    });

    await page.goto('/profile');

    await expect(page.getByRole('link', { name: 'My Public Post' })).toBeVisible();
  });

  test('does not show drafts in posts tab', async ({ page }) => {
    // Create a draft
    await supabaseAdmin.from('posts').insert({
      profile_id: testUserId,
      title: 'My Draft Post',
      expression: 't',
      is_draft: true,
      sample_rate: 8000,
      mode: 'uint8',
    });

    await page.goto('/profile');

    // Should show empty message since draft is not in posts tab
    await expect(page.getByText('This user has no public posts yet.')).toBeVisible();
  });
});

test.describe('Own profile - drafts tab', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('shows empty message when no drafts', async ({ page }) => {
    await page.goto('/profile?tab=drafts');

    await expect(page.getByText('You have no drafts yet.')).toBeVisible();
  });

  test('shows user drafts', async ({ page }) => {
    // Create a draft
    await supabaseAdmin.from('posts').insert({
      profile_id: testUserId,
      title: 'My Draft Post',
      expression: 't',
      is_draft: true,
      sample_rate: 8000,
      mode: 'uint8',
    });

    await page.goto('/profile?tab=drafts');

    await expect(page.getByRole('link', { name: 'My Draft Post' })).toBeVisible();
    await expect(page.locator('.chip.draft-badge')).toHaveText('Draft');
  });
});

test.describe('Own profile - favorites tab', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('shows empty message when no favorites', async ({ page }) => {
    await page.goto('/profile?tab=favorites');

    await expect(page.getByText('This user has no public favorites yet.')).toBeVisible();
  });

  test('shows favorited posts', async ({ page }) => {
    // Create a post by other user
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post I Favorited',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Favorite it
    await supabaseAdmin.from('favorites').insert({
      profile_id: testUserId,
      post_id: post!.id,
    });

    await page.goto('/profile?tab=favorites');

    await expect(page.getByRole('link', { name: 'Post I Favorited' })).toBeVisible({
      timeout: 10000,
    });
  });
});

test.describe('Other user profile page (/u/[username])', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('displays other user username', async ({ page }) => {
    await page.goto(`/u/${OTHER_USERNAME}`);

    await expect(page.getByRole('heading', { name: `@${OTHER_USERNAME}` })).toBeVisible();
  });

  test('shows follow button on other user profile', async ({ page }) => {
    await page.goto(`/u/${OTHER_USERNAME}`);

    await expect(page.getByRole('button', { name: 'Follow' })).toBeVisible();
  });

  test('does not show drafts tab on other user profile', async ({ page }) => {
    await page.goto(`/u/${OTHER_USERNAME}`);

    await expect(page.locator('.tab-button', { hasText: 'Posts' })).toBeVisible();
    await expect(page.locator('.tab-button', { hasText: 'Favorites' })).toBeVisible();
    await expect(page.locator('.tab-button', { hasText: 'Drafts' })).toHaveCount(0);
  });

  test('does not show edit button on other user profile', async ({ page }) => {
    await page.goto(`/u/${OTHER_USERNAME}`);

    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });

  test('can follow and unfollow user', async ({ page }) => {
    await page.goto(`/u/${OTHER_USERNAME}`);

    const followButton = page.getByRole('button', { name: 'Follow' });
    await expect(followButton).toBeVisible();

    // Follow
    await followButton.click();
    await expect(page.getByRole('button', { name: 'Followed' })).toBeVisible();

    // Unfollow
    await page.getByRole('button', { name: 'Followed' }).click();
    await expect(page.getByRole('button', { name: 'Follow' })).toBeVisible();
  });

  test('shows other user posts', async ({ page }) => {
    // Create a post for other user
    await supabaseAdmin.from('posts').insert({
      profile_id: otherUserId,
      title: 'Other User Post',
      expression: 't',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    });

    await page.goto(`/u/${OTHER_USERNAME}`);

    await expect(page.getByRole('link', { name: 'Other User Post' })).toBeVisible();
  });

  test('does not show other user drafts', async ({ page }) => {
    // Create a draft for other user
    await supabaseAdmin.from('posts').insert({
      profile_id: otherUserId,
      title: 'Other User Draft',
      expression: 't',
      is_draft: true,
      sample_rate: 8000,
      mode: 'uint8',
    });

    await page.goto(`/u/${OTHER_USERNAME}`);

    // Should show empty message
    await expect(page.getByText('This user has no public posts yet.')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('link', { name: 'Other User Draft' })).toHaveCount(0);
  });
});

test.describe('Profile page - unauthenticated', () => {
  test.beforeEach(async ({ page }) => {
    await clearSupabaseSession(page);
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('can view other user profile without login', async ({ page }) => {
    // Create a post
    await supabaseAdmin.from('posts').insert({
      profile_id: testUserId,
      title: 'Public Post',
      expression: 't',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    });

    await page.goto(`/u/${TEST_USERNAME}`);

    await expect(page.getByRole('heading', { name: `@${TEST_USERNAME}` })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Public Post' })).toBeVisible();
  });

  test('shows follow button but redirects to login when clicked', async ({ page }) => {
    await page.goto(`/u/${TEST_USERNAME}`);

    const followButton = page.getByRole('button', { name: 'Follow' });
    await expect(followButton).toBeVisible();

    await followButton.click();

    await page.waitForURL('/login');
  });

  test('shows error for non-existent user', async ({ page }) => {
    await page.goto('/u/nonexistent_user_12345');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText('User not found.')).toBeVisible();
  });
});
