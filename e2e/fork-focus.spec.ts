import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { signInAndInjectSession } from './utils/auth';
import { clearAndTypeInExpressionEditor } from './utils/codemirror-helpers';

const TEST_USER_EMAIL = 'e2e+fork_focus@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_fork_focus_user';

const OTHER_USER_EMAIL = 'e2e+fork_focus_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_fork_focus_other';

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
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', otherUserId);
});

test.describe('Fork Focus Mode - navigation and UI', () => {
  let originalPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Original Post for Fork Focus',
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

  test('can navigate to focus mode from fork page', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const focusModeButton = page.getByRole('button', { name: /Enter Focus Mode/i });
    await expect(focusModeButton).toBeVisible();
    await focusModeButton.click();

    await page.waitForURL(`/fork/${originalPostId}/focus`);
    await expect(page).toHaveURL(`/fork/${originalPostId}/focus`);
  });

  test('focus mode shows minimal UI', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify focus mode UI elements are present
    await expect(page.getByRole('button', { name: /Exit Focus Mode/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();

    // Verify minimal UI - no navigation or footer player
    await expect(page.locator('nav')).toHaveCount(0);
    await expect(page.locator('.footer-player')).toHaveCount(0);
  });

  test('can exit focus mode back to normal fork page', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const exitButton = page.getByRole('button', { name: /Exit Focus Mode/i });
    await exitButton.click();

    await page.waitForURL(`/fork/${originalPostId}`);
    await expect(page).toHaveURL(`/fork/${originalPostId}`);
  });

  test('loads original post data in focus mode', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // In focus mode, title is displayed as a clickable span in the header
    await expect(page.locator('.focus-title-display')).toHaveText('Original Post for Fork Focus');

    // Expression should be loaded
    await expect(page.locator('.cm-content')).toContainText('t >> 3');

    // Verify mode and sample rate are correct
    await expect(page.locator('.chip').filter({ hasText: 'int8' })).toBeVisible();
    await expect(page.locator('.chip').filter({ hasText: '11.025kHz' })).toBeVisible();
  });
});

test.describe('Fork Focus Mode - local storage persistence', () => {
  let originalPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Original for Storage Test',
        description: 'Original description',
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

  test('preserves changes in local storage on page reload', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click on title to edit it
    const titleDisplay = page.locator('.focus-title-display');
    await titleDisplay.click();

    const titleInput = page.locator('.focus-title-input');
    await titleInput.clear();
    await titleInput.fill('Modified Fork Title');
    await titleInput.press('Enter');

    await clearAndTypeInExpressionEditor(page, 't * 7');

    await page.reload();
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(titleDisplay).toHaveText('Modified Fork Title');
    await expect(page.locator('.cm-content')).toContainText('t * 7');
  });

  test('preserves changes when switching between normal and focus mode', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.clear();
    await titleField.fill('Changed in Normal Fork');

    await page.getByRole('button', { name: /Enter Focus Mode/i }).click();
    await page.waitForURL(`/fork/${originalPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // In focus mode, check the title display
    const titleDisplay = page.locator('.focus-title-display');
    await expect(titleDisplay).toHaveText('Changed in Normal Fork');

    // Click to edit title in focus mode
    await titleDisplay.click();
    const titleInput = page.locator('.focus-title-input');
    await titleInput.clear();
    await titleInput.fill('Changed in Fork Focus');
    await titleInput.press('Enter');

    await page.getByRole('button', { name: /Exit Focus Mode/i }).click();
    await page.waitForURL(`/fork/${originalPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(titleField).toHaveValue('Changed in Fork Focus');
  });

  test('clears local storage after successful publish', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click on title to edit it
    const titleDisplay = page.locator('.focus-title-display');
    await titleDisplay.click();

    const titleInput = page.locator('.focus-title-input');
    await titleInput.clear();
    await titleInput.fill('Fork Before Publish');
    await titleInput.press('Enter');

    await page.getByRole('button', { name: 'Publish' }).click();

    const publishPanel = page.locator('.publish-panel');
    await expect(publishPanel).toBeVisible();
    await publishPanel.getByRole('button', { name: 'Publish' }).click();

    await page.waitForURL(/\/post\//);

    await page.goto(`/fork/${originalPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(titleDisplay).toHaveText('Original for Storage Test');
  });
});

test.describe('Fork Focus Mode - saving and publishing', () => {
  let originalPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Original to Fork',
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

  test('can publish fork from focus mode', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click on title to edit it
    const titleDisplay = page.locator('.focus-title-display');
    await titleDisplay.click();

    const titleInput = page.locator('.focus-title-input');
    await titleInput.clear();
    await titleInput.fill('Published Fork from Focus');
    await titleInput.press('Enter');

    await page.getByRole('button', { name: 'Publish' }).click();

    const publishPanel = page.locator('.publish-panel');
    await expect(publishPanel).toBeVisible();
    await publishPanel.getByRole('button', { name: 'Publish' }).click();

    await page.waitForURL(/\/post\//);

    await expect(page.getByRole('link', { name: 'Published Fork from Focus' })).toBeVisible();
  });

  test('publish button disabled with invalid expression', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await clearAndTypeInExpressionEditor(page, 't +');

    const publishButton = page.getByRole('button', { name: 'Publish' });
    await expect(publishButton).toBeDisabled();
  });

  test('forked post shows attribution on detail page', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    const forkLink = page.locator('.fork-link');
    await expect(forkLink).toBeVisible();
    await expect(forkLink).toContainText('Forked from Original to Fork');
    await expect(forkLink).toContainText(`@${OTHER_USERNAME}`);
  });
});

test.describe('Fork Focus Mode - keyboard shortcuts', () => {
  let originalPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Shortcut Test Fork',
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

  test('Ctrl+Shift+F exits focus mode', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await page.keyboard.press('Control+Shift+F');

    await page.waitForURL(`/fork/${originalPostId}`);
    await expect(page).toHaveURL(`/fork/${originalPostId}`);
  });
});
