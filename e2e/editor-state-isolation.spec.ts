import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { signInAndInjectSession } from './utils/auth';
import {
  clearAndTypeInExpressionEditor,
  setTitle,
  expectTitleEquals,
} from './utils/editor-helpers';

const TEST_USER_EMAIL = 'e2e+state-isolation@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_state_user';

let testUserId: string;
let existingPostId: string;

test.beforeAll(async () => {
  const user = await ensureTestUser({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  testUserId = user.id;
});

test.beforeEach(async ({ page }) => {
  await clearProfilesTable();
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);

  await signInAndInjectSession(page, {
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

  // Create an existing post for edit/fork tests
  const { data } = await supabaseAdmin
    .from('posts')
    .insert({
      profile_id: testUserId,
      title: 'Existing Post',
      description: 'Original description',
      expression: 't >> 2',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    })
    .select('id')
    .single();

  existingPostId = data!.id;
});

test.describe('State isolation between editor pages', () => {
  test('create draft isolated from edit page', async ({ page }) => {
    // Create a draft on create page
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await clearAndTypeInExpressionEditor(page, 't * 2');
    await setTitle(page, 'Create Draft');

    // Navigate to edit an existing post
    await page.goto(`/edit/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Should show original post data, not create draft
    await expectTitleEquals(page, 'Existing Post');
    await expect(page.locator('.cm-content')).toContainText('t >> 2');
    await expect(page.locator('.cm-content')).not.toContainText('t * 2');

    // Navigate back to create - should restore create draft
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expectTitleEquals(page, 'Create Draft');
    await expect(page.locator('.cm-content')).toContainText('t * 2');
  });

  test('fork draft isolated from original post', async ({ page }) => {
    // Start forking
    await page.goto(`/fork/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Modify the fork
    await clearAndTypeInExpressionEditor(page, 't * 5');
    await setTitle(page, 'Forked Version');

    // Navigate to edit original post
    await page.goto(`/edit/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Should show original post data, not fork changes
    await expectTitleEquals(page, 'Existing Post');
    await expect(page.locator('.cm-content')).toContainText('t >> 2');
    await expect(page.locator('.cm-content')).not.toContainText('t * 5');

    // Navigate back to fork - should restore fork draft
    await page.goto(`/fork/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expectTitleEquals(page, 'Forked Version');
    await expect(page.locator('.cm-content')).toContainText('t * 5');
  });

  test('edit draft isolated from fork draft', async ({ page }) => {
    // Edit the post
    await page.goto(`/edit/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await clearAndTypeInExpressionEditor(page, 't * 3');
    await setTitle(page, 'Edited Version');

    // Navigate to fork the same post
    await page.goto(`/fork/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Should show original post data, not edit changes
    await expectTitleEquals(page, 'Existing Post');
    await expect(page.locator('.cm-content')).toContainText('t >> 2');
    await expect(page.locator('.cm-content')).not.toContainText('t * 3');

    // Make fork changes
    await clearAndTypeInExpressionEditor(page, 't * 7');
    await setTitle(page, 'Fork Version');

    // Navigate back to edit - should restore edit draft
    await page.goto(`/edit/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expectTitleEquals(page, 'Edited Version');
    await expect(page.locator('.cm-content')).toContainText('t * 3');
  });

  test('multiple fork drafts isolated by post ID', async ({ page }) => {
    // Create a second post
    const { data: secondPost } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Second Post',
        expression: 't & 255',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    const secondPostId = secondPost!.id;

    // Fork first post
    await page.goto(`/fork/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await clearAndTypeInExpressionEditor(page, 't * 10');
    await setTitle(page, 'Fork of First');

    // Fork second post
    await page.goto(`/fork/${secondPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await clearAndTypeInExpressionEditor(page, 't * 20');
    await setTitle(page, 'Fork of Second');

    // Go back to first fork - should have first fork's changes
    await page.goto(`/fork/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expectTitleEquals(page, 'Fork of First');
    await expect(page.locator('.cm-content')).toContainText('t * 10');

    // Go back to second fork - should have second fork's changes
    await page.goto(`/fork/${secondPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expectTitleEquals(page, 'Fork of Second');
    await expect(page.locator('.cm-content')).toContainText('t * 20');
  });

  test('clearing create draft does not affect edit drafts', async ({ page }) => {
    // Create a draft on create page
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await clearAndTypeInExpressionEditor(page, 't * 100');
    await setTitle(page, 'Create Draft');

    // Create an edit draft
    await page.goto(`/edit/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await clearAndTypeInExpressionEditor(page, 't * 200');
    await setTitle(page, 'Edit Draft');

    // Clear localStorage for create page
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });
    await page.evaluate(() => {
      localStorage.removeItem('bytebeat-cloud-create-draft-v1');
    });
    await page.reload();

    // Create draft should be cleared
    await expectTitleEquals(page, '');
    await expect(page.locator('.cm-content')).not.toContainText('t * 100');

    // Edit draft should still exist
    await page.goto(`/edit/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expectTitleEquals(page, 'Edit Draft');
    await expect(page.locator('.cm-content')).toContainText('t * 200');
  });
});

test.describe('Draft expiry and cleanup', () => {
  test('expired drafts are not loaded', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Manually set an expired draft (8 days old)
    await page.evaluate(() => {
      const expiredDraft = {
        title: 'Expired Draft',
        expression: 't * 999',
        mode: 'uint8',
        sampleRate: 8000,
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
      };
      localStorage.setItem('bytebeat-cloud-create-draft-v1', JSON.stringify(expiredDraft));
    });

    await page.reload();
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Should not load expired draft
    await expectTitleEquals(page, '');
    await expect(page.locator('.cm-content')).not.toContainText('t * 999');
  });

  test('recent drafts are loaded', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Manually set a recent draft (1 day old)
    await page.evaluate(() => {
      const recentDraft = {
        title: 'Recent Draft',
        expression: 't * 888',
        mode: 'uint8',
        sampleRate: 8000,
        timestamp: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
      };
      localStorage.setItem('bytebeat-cloud-create-draft-v1', JSON.stringify(recentDraft));
    });

    await page.reload();
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Should load recent draft
    await expectTitleEquals(page, 'Recent Draft');
    await expect(page.locator('.cm-content')).toContainText('t * 888');
  });
});
