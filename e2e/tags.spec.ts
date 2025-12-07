import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
  waitForTagsIndexed,
} from './utils/supabaseAdmin';
import { clearSupabaseSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+tags@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_tags_user';

let testUserId: string;

test.beforeAll(async () => {
  const user = await ensureTestUser({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  testUserId = user.id;
});

test.beforeEach(async () => {
  await clearProfilesTable();

  // Clean up test posts
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
});

test.describe('Tag page - viewing', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    // Create posts with tags
    const { data: posts } = await supabaseAdmin
      .from('posts')
      .insert([
        {
          profile_id: testUserId,
          title: 'Post With Music Tag',
          description: 'A post about #music',
          expression: 't',
          is_draft: false,
          sample_rate: 8000,
          mode: 'uint8',
        },
        {
          profile_id: testUserId,
          title: 'Another Music Post',
          description: 'More #music content',
          expression: 't >> 1',
          is_draft: false,
          sample_rate: 8000,
          mode: 'uint8',
        },
        {
          profile_id: testUserId,
          title: 'Post With Different Tag',
          description: 'This is about #bytebeat',
          expression: 't >> 2',
          is_draft: false,
          sample_rate: 8000,
          mode: 'uint8',
        },
      ])
      .select('id');

    // Wait for tags to be indexed
    if (posts) {
      for (const post of posts) {
        await waitForTagsIndexed(post.id, 1);
      }
    }

    await clearSupabaseSession(page);
  });

  test('displays tag heading', async ({ page }) => {
    await page.goto('/tags/music');

    await expect(page.getByRole('heading', { name: '#music' })).toBeVisible();
  });

  test('shows posts with the tag', async ({ page }) => {
    await page.goto('/tags/music');

    // Wait for posts to load
    await expect(page.locator('.post-item')).toHaveCount(2, { timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Post With Music Tag' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Another Music Post' })).toBeVisible();

    // Should not show post with different tag
    await expect(page.getByRole('link', { name: 'Post With Different Tag' })).toHaveCount(0);
  });

  test('shows empty message for non-existent tag', async ({ page }) => {
    await page.goto('/tags/nonexistenttag');

    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByText('No posts found for this tag.')).toBeVisible();
  });

  test('tag is case-insensitive', async ({ page }) => {
    await page.goto('/tags/MUSIC');

    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Should still find posts with #music
    await expect(page.locator('.post-item')).toHaveCount(2);
  });
});

test.describe('Tag page - tabs', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    await supabaseAdmin.from('posts').insert({
      profile_id: testUserId,
      title: 'Tagged Post',
      description: '#testtag',
      expression: 't',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    });

    await clearSupabaseSession(page);
  });

  test('shows recent and trending tabs', async ({ page }) => {
    await page.goto('/tags/testtag');

    await expect(page.locator('.tab-button', { hasText: 'Recent' })).toBeVisible();
    await expect(page.locator('.tab-button', { hasText: 'Trending' })).toBeVisible();
  });

  test('default tab is recent', async ({ page }) => {
    await page.goto('/tags/testtag');

    await expect(page.locator('.tab-button.active')).toHaveText('Recent');
  });

  test('can switch between tabs', async ({ page }) => {
    await page.goto('/tags/testtag');

    // Switch to trending
    await page.locator('.tab-button', { hasText: 'Trending' }).click();
    await expect(page.locator('.tab-button.active')).toHaveText('Trending');
    await expect(page).toHaveURL(/tab=trending/);

    // Switch back to recent
    await page.locator('.tab-button', { hasText: 'Recent' }).click();
    await expect(page.locator('.tab-button.active')).toHaveText('Recent');
    await expect(page).toHaveURL(/tab=recent/);
  });

  test('tab state persists in URL', async ({ page }) => {
    await page.goto('/tags/testtag?tab=trending');

    await expect(page.locator('.tab-button.active')).toHaveText('Trending');
  });
});

test.describe('Tag page - navigation from post', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    await supabaseAdmin.from('posts').insert({
      profile_id: testUserId,
      title: 'Post With Clickable Tag',
      description: 'Check out #clicktag',
      expression: 't',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    });

    await clearSupabaseSession(page);
  });

  test('clicking tag chip on post navigates to tag page', async ({ page }) => {
    await page.goto('/explore?tab=recent');

    await expect(page.locator('.post-item')).toHaveCount(1, { timeout: 10000 });

    // Click on the tag chip
    await page.locator('.chip.tag-chip', { hasText: '#clicktag' }).click();

    await page.waitForURL(/\/tags\/clicktag/);
    await expect(page.getByRole('heading', { name: '#clicktag' })).toBeVisible();
  });

  test('clicking tag in post detail description navigates to tag page', async ({ page }) => {
    // First get the post ID
    const { data } = await supabaseAdmin
      .from('posts')
      .select('id')
      .eq('title', 'Post With Clickable Tag')
      .single();

    await page.goto(`/post/${data!.id}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click on the tag in description
    await page.locator('.post-description-detail').getByRole('link', { name: '#clicktag' }).click();

    await page.waitForURL(/\/tags\/clicktag/);
    await expect(page.getByRole('heading', { name: '#clicktag' })).toBeVisible();
  });
});

test.describe('Tag page - multiple tags', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Post With Multiple Tags',
        description: 'This has #tag1 and #tag2 and #tag3',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Wait for tags to be indexed
    if (post) {
      await waitForTagsIndexed(post.id, 3);
    }

    await clearSupabaseSession(page);
  });

  test('post appears on each tag page', async ({ page }) => {
    // Check tag1
    await page.goto('/tags/tag1');
    await expect(page.getByRole('link', { name: 'Post With Multiple Tags' })).toBeVisible({
      timeout: 10000,
    });

    // Check tag2
    await page.goto('/tags/tag2');
    await expect(page.getByRole('link', { name: 'Post With Multiple Tags' })).toBeVisible({
      timeout: 10000,
    });

    // Check tag3
    await page.goto('/tags/tag3');
    await expect(page.getByRole('link', { name: 'Post With Multiple Tags' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('post shows all tag chips', async ({ page }) => {
    await page.goto('/tags/tag1');

    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    const postItem = page.locator('.post-item');
    await expect(postItem.locator('.chip.tag-chip', { hasText: '#tag1' })).toBeVisible();
    await expect(postItem.locator('.chip.tag-chip', { hasText: '#tag2' })).toBeVisible();
    await expect(postItem.locator('.chip.tag-chip', { hasText: '#tag3' })).toBeVisible();
  });
});

test.describe('Tag page - drafts not shown', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    await supabaseAdmin.from('posts').insert([
      {
        profile_id: testUserId,
        title: 'Public Tagged Post',
        description: '#publictag',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      },
      {
        profile_id: testUserId,
        title: 'Draft Tagged Post',
        description: '#publictag',
        expression: 't >> 1',
        is_draft: true,
        sample_rate: 8000,
        mode: 'uint8',
      },
    ]);

    await clearSupabaseSession(page);
  });

  test('draft posts do not appear on tag page', async ({ page }) => {
    await page.goto('/tags/publictag');

    await expect(page.getByText('Loading posts…')).toHaveCount(0, { timeout: 10000 });

    // Should only show the public post
    await expect(page.locator('.post-item')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Public Tagged Post' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Draft Tagged Post' })).toHaveCount(0);
  });
});
