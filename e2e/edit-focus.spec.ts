import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { signInAndInjectSession } from './utils/auth';
import { clearAndTypeInExpressionEditor } from './utils/codemirror-helpers';

const TEST_USER_EMAIL = 'e2e+edit_focus@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_edit_focus_user';

let testUserId: string;

test.beforeAll(async () => {
  const user = await ensureTestUser({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  testUserId = user.id;
});

test.beforeEach(async () => {
  await clearProfilesTable();
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
});

test.describe('Edit Focus Mode - navigation and UI', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Test Post for Focus',
        description: 'Test description',
        expression: 't >> 4',
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
  });

  test('can navigate to focus mode from edit page', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const focusModeButton = page.getByRole('button', { name: /Enter Focus Mode/i });
    await expect(focusModeButton).toBeVisible();
    await focusModeButton.click();

    await page.waitForURL(`/edit/${testPostId}/focus`);
    await expect(page).toHaveURL(`/edit/${testPostId}/focus`);
  });

  test('focus mode shows minimal UI', async ({ page }) => {
    await page.goto(`/edit/${testPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify focus mode UI elements are present
    await expect(page.getByRole('button', { name: /Exit Focus Mode/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();

    // Verify minimal UI - no navigation or footer player
    await expect(page.locator('nav')).toHaveCount(0);
    await expect(page.locator('.footer-player')).toHaveCount(0);
  });

  test('can exit focus mode back to normal edit page', async ({ page }) => {
    await page.goto(`/edit/${testPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const exitButton = page.getByRole('button', { name: /Exit Focus Mode/i });
    await exitButton.click();

    await page.waitForURL(`/edit/${testPostId}`);
    await expect(page).toHaveURL(`/edit/${testPostId}`);
  });

  test('loads post data in focus mode', async ({ page }) => {
    await page.goto(`/edit/${testPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // In focus mode, title is displayed as a clickable span in the header
    await expect(page.locator('.focus-title-display')).toHaveText('Test Post for Focus');

    // Expression should be loaded
    await expect(page.locator('.cm-content')).toContainText('t >> 4');

    // Verify mode and sample rate are correct
    await expect(page.locator('.chip').filter({ hasText: 'uint8' })).toBeVisible();
    await expect(page.locator('.chip').filter({ hasText: '8kHz' })).toBeVisible();
  });
});

test.describe('Edit Focus Mode - local storage persistence', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Original Title',
        description: 'Original description',
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
  });

  test('preserves changes in local storage on page reload', async ({ page }) => {
    await page.goto(`/edit/${testPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click on title to edit it
    const titleDisplay = page.locator('.focus-title-display');
    await titleDisplay.click();

    const titleInput = page.locator('.focus-title-input');
    await titleInput.clear();
    await titleInput.fill('Modified Title');
    await titleInput.press('Enter');

    await clearAndTypeInExpressionEditor(page, 't * 3');

    await page.reload();
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(titleDisplay).toHaveText('Modified Title');
    await expect(page.locator('.cm-content')).toContainText('t * 3');
  });

  test('preserves changes when switching between normal and focus mode', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.clear();
    await titleField.fill('Changed in Normal Mode');

    await page.getByRole('button', { name: /Enter Focus Mode/i }).click();
    await page.waitForURL(`/edit/${testPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // In focus mode, check the title display
    const titleDisplay = page.locator('.focus-title-display');
    await expect(titleDisplay).toHaveText('Changed in Normal Mode');

    // Click to edit title in focus mode
    await titleDisplay.click();
    const titleInput = page.locator('.focus-title-input');
    await titleInput.clear();
    await titleInput.fill('Changed in Focus Mode');
    await titleInput.press('Enter');

    await page.getByRole('button', { name: /Exit Focus Mode/i }).click();
    await page.waitForURL(`/edit/${testPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(titleField).toHaveValue('Changed in Focus Mode');
  });

  test('clears local storage after successful publish', async ({ page }) => {
    await page.goto(`/edit/${testPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click on title to edit it
    const titleDisplay = page.locator('.focus-title-display');
    await titleDisplay.click();

    const titleInput = page.locator('.focus-title-input');
    await titleInput.clear();
    await titleInput.fill('Title Before Publish');
    await titleInput.press('Enter');

    await page.getByRole('button', { name: 'Publish', exact: true }).click();

    const publishPanel = page.locator('.publish-panel');
    await expect(publishPanel).toBeVisible();
    await publishPanel.getByRole('button', { name: 'Publish', exact: true }).click();

    await page.waitForURL(/\/post\//);

    await page.goto(`/edit/${testPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(titleDisplay).toHaveText('Title Before Publish');
  });
});

test.describe('Edit Focus Mode - saving and publishing', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Post to Edit',
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
  });

  test('can publish changes from focus mode', async ({ page }) => {
    await page.goto(`/edit/${testPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click on title to edit it
    const titleDisplay = page.locator('.focus-title-display');
    await titleDisplay.click();

    const titleInput = page.locator('.focus-title-input');
    await titleInput.clear();
    await titleInput.fill('Published from Focus');
    await titleInput.press('Enter');

    await page.getByRole('button', { name: 'Publish', exact: true }).click();

    const publishPanel = page.locator('.publish-panel');
    await expect(publishPanel).toBeVisible();
    await publishPanel.getByRole('button', { name: 'Publish', exact: true }).click();

    await page.waitForURL(/\/post\//);

    await expect(page.getByRole('link', { name: 'Published from Focus' })).toBeVisible();
  });

  test('publish button disabled with invalid expression', async ({ page }) => {
    await page.goto(`/edit/${testPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await clearAndTypeInExpressionEditor(page, 't +');

    const publishButton = page.getByRole('button', { name: 'Publish', exact: true });
    await expect(publishButton).toBeDisabled();
  });
});

test.describe('Edit Focus Mode - keyboard shortcuts', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Shortcut Test',
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
  });

  test('Ctrl+Shift+F exits focus mode', async ({ page }) => {
    await page.goto(`/edit/${testPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await page.keyboard.press('Control+Shift+F');

    await page.waitForURL(`/edit/${testPostId}`);
    await expect(page).toHaveURL(`/edit/${testPostId}`);
  });
});
