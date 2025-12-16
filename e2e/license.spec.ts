import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+license@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_license_user';

const OTHER_USER_EMAIL = 'e2e+license_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_license_other';

let testUserId: string;
let otherUserId: string;

// Helper to type into CodeMirror editor
async function typeInExpressionEditor(page: import('@playwright/test').Page, text: string) {
  const editor = page.locator('.expression-input .cm-content');
  await editor.click();
  await page.keyboard.type(text);
}

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

test.describe('License selection - Create page', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('license panel is collapsed by default', async ({ page }) => {
    await page.goto('/create');

    // The details element should exist but be closed
    const licenseDetails = page.locator('details.license-helper');
    await expect(licenseDetails).toBeVisible();
    await expect(licenseDetails).not.toHaveAttribute('open');

    // Radio buttons should not be visible when collapsed
    const radioGroup = page.locator('.radio-group');
    await expect(radioGroup).not.toBeVisible();
  });

  test('clicking license summary expands radio group', async ({ page }) => {
    await page.goto('/create');

    const licenseSummary = page.locator('details.license-helper summary');
    await licenseSummary.click();

    // Radio group should now be visible
    const radioGroup = page.locator('.radio-group');
    await expect(radioGroup).toBeVisible();

    // All license options should be visible
    await expect(page.getByLabel(/All rights reserved/)).toBeVisible();
    await expect(page.getByLabel(/Free to remix/)).toBeVisible();
    await expect(page.getByLabel(/Public domain/)).toBeVisible();
    await expect(page.getByLabel(/Share alike/)).toBeVisible();
  });

  test('default license is CC BY (Free to remix)', async ({ page }) => {
    await page.goto('/create');

    // Summary should show the default license
    const licenseSummary = page.locator('details.license-helper summary');
    await expect(licenseSummary).toContainText('Free to remix');

    // Expand and verify radio is checked
    await licenseSummary.click();
    const ccByRadio = page.getByLabel(/Free to remix/);
    await expect(ccByRadio).toBeChecked();
  });

  test('can select different license options', async ({ page }) => {
    await page.goto('/create');

    const licenseSummary = page.locator('details.license-helper summary');
    await licenseSummary.click();

    // Select "All rights reserved"
    await page.getByLabel(/All rights reserved/).click();
    await expect(licenseSummary).toContainText('All rights reserved');

    // Select "Public domain"
    await page.getByLabel(/Public domain/).click();
    await expect(licenseSummary).toContainText('Public domain');

    // Select "Share alike"
    await page.getByLabel(/Share alike/).click();
    await expect(licenseSummary).toContainText('Share alike');
  });

  test('selected license is saved with published post', async ({ page }) => {
    await page.goto('/create');

    // Fill in expression
    await typeInExpressionEditor(page, 't * 7');

    // Select "All rights reserved" license
    const licenseSummary = page.locator('details.license-helper summary');
    await licenseSummary.click();
    await page.getByLabel(/All rights reserved/).click();

    // Publish
    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // Verify license affects UI: "All rights reserved" posts cannot be forked
    // Fork link should be disabled
    await clearSupabaseSession(page);
    await page.reload();
    await expect(page.locator('.edit-link.disabled')).toContainText('Fork');
  });
});

test.describe('License selection - Fork page', () => {
  let originalPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create original post with CC BY-SA license
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Original CC BY-SA Post',
        expression: 't >> 3',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
        license: 'cc-by-sa',
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

  test('forking CC BY-SA post locks license to CC BY-SA', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // License should be locked with a hint
    await expect(page.getByText('License inherited from original post')).toBeVisible();

    // Radio group should not be visible (license is locked)
    await expect(page.locator('details.license-helper')).toHaveCount(0);
  });

  test('forked CC BY-SA post inherits license', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Publish the fork
    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // Verify license is inherited: forking this post should also show locked license hint
    // Navigate to fork page of the newly created post
    const postUrl = page.url();
    const postId = postUrl.split('/post/')[1];
    await page.goto(`/fork/${postId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText('License inherited from original post')).toBeVisible();
  });
});

test.describe('License selection - Fork non-ShareAlike post', () => {
  let originalPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create original post with CC BY license (not ShareAlike)
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Original CC BY Post',
        expression: 't * 2',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
        license: 'cc-by',
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

  test('forking CC BY post allows license selection', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // License should NOT be locked
    await expect(page.getByText('License inherited from original post')).toHaveCount(0);

    // License panel should be available
    const licenseDetails = page.locator('details.license-helper');
    await expect(licenseDetails).toBeVisible();
  });

  test('can change license when forking CC BY post', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Change license to "All rights reserved"
    const licenseSummary = page.locator('details.license-helper summary');
    await licenseSummary.click();
    await page.getByLabel(/All rights reserved/).click();

    // Publish
    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    await clearSupabaseSession(page);
    await page.reload();

    // Verify license is "All rights reserved": Fork link should be disabled
    await expect(page.locator('.edit-link.disabled')).toContainText('Fork');
  });
});

test.describe('License behavior on post detail', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('All Rights Reserved post disables fork button', async ({ page }) => {
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'ARR Post',
        expression: 't',
        is_draft: false,
        license: 'all-rights-reserved',
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Sign out so we see the Fork button (not Edit)
    await clearSupabaseSession(page);
    await page.goto(`/post/${data!.id}`);

    // Fork link should be disabled for all-rights-reserved
    await expect(page.locator('.edit-link.disabled')).toContainText('Fork');
  });

  test('CC BY post enables fork button', async ({ page }) => {
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'CC BY Post',
        expression: 't',
        is_draft: false,
        license: 'cc-by',
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Sign out so we see the Fork button (not Edit)
    await clearSupabaseSession(page);
    await page.goto(`/post/${data!.id}`);

    // Fork link should be enabled (not disabled)
    const forkLink = page.locator('a.edit-link').filter({ hasText: 'Fork' });
    await expect(forkLink).toBeVisible();
    await expect(page.locator('.edit-link.disabled')).toHaveCount(0);
  });

  test('CC0 post enables fork button', async ({ page }) => {
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'CC0 Post',
        expression: 't',
        is_draft: false,
        license: 'cc0',
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Sign out so we see the Fork button (not Edit)
    await clearSupabaseSession(page);
    await page.goto(`/post/${data!.id}`);

    // Fork link should be enabled
    const forkLink = page.locator('a.edit-link').filter({ hasText: 'Fork' });
    await expect(forkLink).toBeVisible();
    await expect(page.locator('.edit-link.disabled')).toHaveCount(0);
  });

  test('CC BY-SA post enables fork button', async ({ page }) => {
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'CC BY-SA Post',
        expression: 't',
        is_draft: false,
        license: 'cc-by-sa',
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Sign out so we see the Fork button (not Edit)
    await clearSupabaseSession(page);
    await page.goto(`/post/${data!.id}`);

    // Fork link should be enabled
    const forkLink = page.locator('a.edit-link').filter({ hasText: 'Fork' });
    await expect(forkLink).toBeVisible();
    await expect(page.locator('.edit-link.disabled')).toHaveCount(0);
  });
});

test.describe('License - unauthenticated', () => {
  test.beforeEach(async ({ page }) => {
    await clearSupabaseSession(page);
  });

  test('license panel is not shown when not logged in', async ({ page }) => {
    await page.goto('/create');

    // License panel should not be visible for unauthenticated users
    // since they can't publish anyway
    await expect(page.locator('details.license-helper')).toHaveCount(0);
  });
});
