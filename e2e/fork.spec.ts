import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';
import { clearAndTypeInExpressionEditor } from './utils/editor-helpers';

const TEST_USER_EMAIL = 'e2e+fork@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_fork_user';

const OTHER_USER_EMAIL = 'e2e+fork_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_fork_other';

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

test.describe('Fork page - loading original post', () => {
  let originalPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create original post by other user
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Original Post Title',
        description: 'Original description',
        expression: 't >> 3',
        is_draft: false,
        sample_rate: 11025,
        mode: 'int8',
      })
      .select('id')
      .single();

    originalPostId = data!.id;

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('loads original post data into form', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify title is pre-filled
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await expect(titleField).toHaveValue('Original Post Title');

    // Verify description is pre-filled
    const descriptionField = page.getByPlaceholder('Add an optional description');
    await expect(descriptionField).toHaveValue('Original description');

    // Verify mode is loaded
    await expect(page.getByRole('button', { name: 'int8' })).toBeVisible();

    // Verify sample rate is loaded
    await expect(page.getByRole('button', { name: '11.025kHz' })).toBeVisible();

    // Verify expression is loaded
    await expect(page.locator('.cm-content')).toContainText('t >> 3');
  });

  test('shows fork attribution with original author', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Should show "Fork from [title] by @[author]"
    await expect(page.getByText('Fork from')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Original Post Title' })).toBeVisible();
    await expect(page.getByRole('link', { name: `@${OTHER_USERNAME}` })).toBeVisible();
  });

  test('shows heading and back button', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByRole('heading', { name: 'Fork post' })).toBeVisible();
    await expect(page.getByRole('button', { name: '← Back' })).toBeVisible();
  });

  test('shows error for non-existent post', async ({ page }) => {
    await page.goto('/fork/00000000-0000-0000-0000-000000000000');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByText('Post not found.')).toBeVisible();
  });
});

test.describe('Fork page - saving fork', () => {
  let originalPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Original Post',
        expression: 't * 2',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    originalPostId = data!.id;

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('publishing fork redirects to new post detail page', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Modify title to make it unique
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.clear();
    await titleField.fill('My Forked Post');

    // Publish
    const publishButton = page.getByRole('button', { name: 'Publish' });
    await publishButton.click();

    // Should redirect to new post detail (not the original)
    await page.waitForURL(/\/post\/(?!.*originalPostId)/);

    // Verify it's the forked post
    await expect(page.getByRole('link', { name: 'My Forked Post' })).toBeVisible();
  });

  test('forked post shows forked from attribution on detail page', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Publish without changes
    const publishButton = page.getByRole('button', { name: 'Publish' });
    await publishButton.click();

    await page.waitForURL(/\/post\//);

    // Should show "Forked from" attribution in the fork-link
    const forkLink = page.locator('.fork-link');
    await expect(forkLink).toBeVisible();
    await expect(forkLink).toContainText('Forked from Original Post');
    await expect(forkLink).toContainText(`@${OTHER_USERNAME}`);
  });

  test('can modify expression before publishing fork', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Modify expression
    await clearAndTypeInExpressionEditor(page, 't * 5');

    // Publish
    const publishButton = page.getByRole('button', { name: 'Publish' });
    await publishButton.click();

    await page.waitForURL(/\/post\//);

    // Verify modified expression
    await expect(page.locator('.cm-content')).toContainText('t * 5');
  });

  test('saving fork as draft redirects to edit page', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Open overflow menu and click "Save as draft" button
    const overflowTrigger = page.locator('.overflow-menu-trigger');
    await overflowTrigger.click();
    const draftButton = page.getByRole('button', { name: 'Save as draft' });
    await draftButton.click();

    // Should redirect to edit page for the new draft
    await page.waitForURL(/\/edit\/[a-f0-9-]+/);
  });

  test('publish button disabled with invalid expression', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Enter invalid expression
    await clearAndTypeInExpressionEditor(page, 't +');

    // Publish button should be disabled
    const publishButton = page.getByRole('button', { name: 'Publish' });
    await expect(publishButton).toBeDisabled();
  });
});

test.describe('Fork page - forked post appears in lineage', () => {
  let originalPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Original With Forks',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    originalPostId = data!.id;

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('forked post appears in original post lineage as descendant', async ({ page }) => {
    // First, create the fork
    await page.goto(`/fork/${originalPostId}`);

    // Wait for form to load
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await expect(titleField).toBeVisible({ timeout: 10000 });

    await titleField.clear();
    await titleField.fill('My New Fork');

    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // Now navigate to original post
    await page.goto(`/post/${originalPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click on Lineage tab to view lineage
    const lineageTab = page.locator('.tab-button', { hasText: 'Lineage' });
    await lineageTab.click();

    // Lineage section should show the fork as a descendant
    const lineageTree = page.locator('.lineage-tree');
    await expect(lineageTree.getByRole('link', { name: /My New Fork/ })).toBeVisible();
  });

  test('forked post shows original in lineage as ancestor', async ({ page }) => {
    // First, create the fork
    await page.goto(`/fork/${originalPostId}`);

    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await expect(titleField).toBeVisible({ timeout: 10000 });

    await titleField.clear();
    await titleField.fill('Child Fork Post');

    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // We're now on the forked post's detail page
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click on Lineage tab to view lineage
    const lineageTab = page.locator('.tab-button', { hasText: 'Lineage' });
    await lineageTab.click();

    // Lineage should show the original as an ancestor
    const lineageTree = page.locator('.lineage-tree');
    await expect(lineageTree.getByRole('link', { name: /Original With Forks/ })).toBeVisible();
    // Current post should also be in the tree
    await expect(lineageTree.getByRole('link', { name: /Child Fork Post/ })).toBeVisible();
  });

  test('lineage shows multi-level fork chain', async ({ page }) => {
    // Create first fork
    await page.goto(`/fork/${originalPostId}`);

    let titleField = page.getByPlaceholder('Name your bytebeat expression');
    await expect(titleField).toBeVisible({ timeout: 10000 });

    await titleField.clear();
    await titleField.fill('First Generation Fork');

    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // Get the first fork's ID from URL
    const firstForkUrl = page.url();
    const firstForkId = firstForkUrl.split('/post/')[1];

    // Create second fork (fork of fork)
    await page.goto(`/fork/${firstForkId}`);

    titleField = page.getByPlaceholder('Name your bytebeat expression');
    await expect(titleField).toBeVisible({ timeout: 10000 });

    await titleField.clear();
    await titleField.fill('Second Generation Fork');

    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // We're on the second fork's page - lineage should show full chain
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click on Lineage tab to view lineage
    const lineageTab = page.locator('.tab-button', { hasText: 'Lineage' });
    await lineageTab.click();

    const lineageTree = page.locator('.lineage-tree');

    // Should show: Original -> First Gen -> Second Gen (current)
    await expect(lineageTree.getByRole('link', { name: /Original With Forks/ })).toBeVisible();
    await expect(lineageTree.getByRole('link', { name: /First Generation Fork/ })).toBeVisible();
    await expect(lineageTree.getByRole('link', { name: /Second Generation Fork/ })).toBeVisible();
  });
});

test.describe('Fork page - unauthenticated', () => {
  let originalPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Original Post Unauth',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    originalPostId = data!.id;

    await clearSupabaseSession(page);
  });

  test('shows login prompt and hides save actions', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByText('Log in to publish a post')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0);
    // Overflow menu should not be visible when not logged in
    await expect(page.locator('.overflow-menu-trigger')).toHaveCount(0);
  });

  test('can still view original post data', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Can see the pre-filled data
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await expect(titleField).toHaveValue('Original Post Unauth');
  });
});

test.describe('Fork page - back button and discard changes', () => {
  let originalPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Original for Navigation',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    originalPostId = data!.id;

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('back button redirects to original post detail page', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const backButton = page.getByRole('button', { name: '← Back' });
    await backButton.click();

    await page.waitForURL(`/post/${originalPostId}`);
    await expect(page).toHaveURL(`/post/${originalPostId}`);
  });

  test('discard changes button shows confirmation modal', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Make a change
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.clear();
    await titleField.fill('Modified Fork Title');

    // Open overflow menu and click discard changes
    const overflowTrigger = page.locator('.overflow-menu-trigger');
    await overflowTrigger.click();
    await page.getByRole('button', { name: 'Discard changes' }).click();

    // Modal should appear
    const modal = page.locator('.modal');
    await expect(modal.getByRole('heading', { name: 'Discard changes' })).toBeVisible();
    await expect(modal.getByText(/Your local changes will be discarded/)).toBeVisible();
  });

  test('discard changes button disabled when no changes', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Open overflow menu
    const overflowTrigger = page.locator('.overflow-menu-trigger');
    await overflowTrigger.click();

    // Discard changes button should be disabled
    const discardButton = page.getByRole('button', { name: 'Discard changes' });
    await expect(discardButton).toBeDisabled();
  });

  test('confirming discard reloads original post data', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const titleField = page.getByPlaceholder('Name your bytebeat expression');

    // Make a change
    await titleField.clear();
    await titleField.fill('Changed Fork Title');
    await expect(titleField).toHaveValue('Changed Fork Title');

    // Open overflow menu and discard
    const overflowTrigger = page.locator('.overflow-menu-trigger');
    await overflowTrigger.click();
    await page.getByRole('button', { name: 'Discard changes' }).click();

    // Confirm in modal
    const modal = page.locator('.modal');
    await modal.getByRole('button', { name: 'Discard changes' }).click();

    // Page should reload and show original title
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });
    await expect(titleField).toHaveValue('Original for Navigation');
  });
});

test.describe('Fork page - forking own post', () => {
  let ownPostId: string;

  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    // Create own post
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'My Own Original Post',
        expression: 't >> 1',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    ownPostId = data!.id;
  });

  test('can fork own post via direct URL', async ({ page }) => {
    await page.goto(`/fork/${ownPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Should load successfully
    await expect(page.getByRole('heading', { name: 'Fork post' })).toBeVisible();

    // Shows self as original author
    await expect(page.getByRole('link', { name: `@${TEST_USERNAME}` })).toBeVisible();

    // Can save the fork
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.clear();
    await titleField.fill('Fork Of My Own Post');

    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    await expect(page.getByRole('link', { name: 'Fork Of My Own Post' })).toBeVisible();
    await expect(page.getByText(/Forked from/)).toBeVisible();
  });
});
