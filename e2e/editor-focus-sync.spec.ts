import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { signInAndInjectSession } from './utils/auth';
import { clearAndTypeInExpressionEditor, setTitle, getTitleValue } from './utils/editor-helpers';

const TEST_USER_EMAIL = 'e2e+focus-sync@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_focus_user';

let testUserId: string;
let existingPostId: string;

async function dismissFocusHint(page: import('@playwright/test').Page) {
  const dismissButton = page.getByRole('button', { name: 'Dismiss hint' });
  if ((await dismissButton.count()) > 0) {
    if (await dismissButton.first().isVisible()) {
      await dismissButton.first().click();
      await expect(page.getByRole('button', { name: 'Dismiss hint' })).toHaveCount(0);
    }
  }
}

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
      title: 'Test Post',
      description: 'Test description',
      expression: 't >> 3',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    })
    .select('id')
    .single();

  existingPostId = data!.id;
});

test.describe('Focus mode ↔ Normal mode state synchronization', () => {
  test('create: changes in normal mode appear in focus mode', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Make changes in normal mode
    await clearAndTypeInExpressionEditor(page, 't & 255');
    await setTitle(page, 'Mode Sync Test');
    const descField = page.getByPlaceholder('Add an optional description');
    await descField.fill('Testing sync');

    // Switch to focus mode
    await page.getByRole('button', { name: 'Enter Focus Mode' }).click();
    await page.waitForURL('/create/focus');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify changes appear in focus mode
    await expect(await getTitleValue(page)).toBe('Mode Sync Test');
    await expect(page.locator('.cm-content')).toContainText('t & 255');
    // Description is in PublishPanel, need to open it
    await page.getByRole('button', { name: 'Publish' }).click();
    const focusDescField = page.getByPlaceholder('Add an optional description');
    await expect(focusDescField).toHaveValue('Testing sync');
  });

  test('create: changes in focus mode appear in normal mode', async ({ page }) => {
    await page.goto('/create/focus');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });
    await dismissFocusHint(page);

    // Make changes in focus mode
    await clearAndTypeInExpressionEditor(page, 't ^ 128');
    await setTitle(page, 'Focus Changes');

    // Open publish panel to set description
    await page.getByRole('button', { name: 'Publish' }).click();
    const descField = page.getByPlaceholder('Add an optional description');
    await descField.fill('From focus mode');
    await page.keyboard.press('Escape'); // Close panel

    // Switch to normal mode
    await page.getByRole('button', { name: 'Exit Focus Mode' }).click();
    await page.waitForURL('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify changes appear in normal mode
    await expect(await getTitleValue(page)).toBe('Focus Changes');
    await expect(page.locator('.cm-content')).toContainText('t ^ 128');
    const normalDescField = page.getByPlaceholder('Add an optional description');
    await expect(normalDescField).toHaveValue('From focus mode');
  });

  test('edit: changes in normal mode appear in focus mode', async ({ page }) => {
    await page.goto(`/edit/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Make changes in normal mode
    await clearAndTypeInExpressionEditor(page, 't * 7');
    await setTitle(page, 'Edited Title');

    // Switch to focus mode
    await page.getByRole('button', { name: 'Enter Focus Mode' }).click();
    await page.waitForURL(`/edit/${existingPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify changes appear in focus mode
    await expect(await getTitleValue(page)).toBe('Edited Title');
    await expect(page.locator('.cm-content')).toContainText('t * 7');
  });

  test('edit: changes in focus mode appear in normal mode', async ({ page }) => {
    await page.goto(`/edit/${existingPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });
    await dismissFocusHint(page);

    // Make changes in focus mode
    await clearAndTypeInExpressionEditor(page, 't * 9');
    await setTitle(page, 'Focus Edit');

    // Switch to normal mode
    await page.getByRole('button', { name: 'Exit Focus Mode' }).click();
    await page.waitForURL(`/edit/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify changes appear in normal mode
    await expect(await getTitleValue(page)).toBe('Focus Edit');
    await expect(page.locator('.cm-content')).toContainText('t * 9');
  });

  test('fork: changes in normal mode appear in focus mode', async ({ page }) => {
    await page.goto(`/fork/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Make changes in normal mode
    await clearAndTypeInExpressionEditor(page, 't * 11');
    await setTitle(page, 'Forked Title');

    // Switch to focus mode
    await page.getByRole('button', { name: 'Enter Focus Mode' }).click();
    await page.waitForURL(`/fork/${existingPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify changes appear in focus mode
    await expect(await getTitleValue(page)).toBe('Forked Title');
    await expect(page.locator('.cm-content')).toContainText('t * 11');
  });

  test('fork: changes in focus mode appear in normal mode', async ({ page }) => {
    await page.goto(`/fork/${existingPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });
    await dismissFocusHint(page);

    // Make changes in focus mode
    await clearAndTypeInExpressionEditor(page, 't * 13');
    await setTitle(page, 'Focus Fork');

    // Switch to normal mode
    await page.getByRole('button', { name: 'Exit Focus Mode' }).click();
    await page.waitForURL(`/fork/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify changes appear in normal mode
    await expect(await getTitleValue(page)).toBe('Focus Fork');
    await expect(page.locator('.cm-content')).toContainText('t * 13');
  });

  test('mode and sample rate changes sync between modes', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const modeChip = page.locator('.chips button.chip').first();
    const sampleChip = page.locator('.chips button.chip').nth(1);

    await expect(modeChip).toHaveText('uint8');
    await modeChip.click();
    await expect(modeChip).toHaveText('int8');

    await expect(sampleChip).toHaveText('8kHz');
    await sampleChip.click();
    await expect(sampleChip).toHaveText('11.025kHz');

    // Switch to focus mode
    await page.getByRole('button', { name: 'Enter Focus Mode' }).click();
    await page.waitForURL('/create/focus');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });
    await dismissFocusHint(page);

    // Verify mode and sample rate are synced
    const focusChips = page.locator('.focus-footer button.chip');
    const focusModeChip = focusChips.first();
    const focusSampleChip = focusChips.nth(1);
    await expect(focusModeChip).toHaveText('int8');
    await expect(focusSampleChip).toHaveText('11.025kHz');
  });

  test('license changes sync between modes', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await clearAndTypeInExpressionEditor(page, 't * 4');
    await setTitle(page, 'License Sync Test');

    // Change license in normal mode (details disclosure with radio buttons)
    const licenseSummary = page.locator('.license-helper summary');
    await expect(licenseSummary).toHaveText(/License:/);
    await licenseSummary.click();

    const publicDomainOption = page.getByLabel(/Public domain \(CC0\)/);
    await publicDomainOption.check();

    // Ensure summary reflects new license
    await expect(licenseSummary).toHaveText(/Public domain \(CC0\)/);

    // Switch to focus mode
    await page.getByRole('button', { name: 'Enter Focus Mode' }).click();
    await page.waitForURL('/create/focus');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });
    await dismissFocusHint(page);

    // Open publish panel to verify license
    await page.getByRole('button', { name: 'Publish' }).click();
    const focusLicenseSelect = page.locator('.publish-panel select').first();
    await expect(focusLicenseSelect).toHaveValue('cc0');
  });

  test('rapid mode switching preserves all changes', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Make initial changes
    await clearAndTypeInExpressionEditor(page, 't * 100');
    await setTitle(page, 'Rapid Switch Test');

    // Switch to focus mode
    await page.getByRole('button', { name: 'Enter Focus Mode' }).click();
    await page.waitForURL('/create/focus');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });
    await dismissFocusHint(page);

    // Make more changes in focus mode
    await clearAndTypeInExpressionEditor(page, 't * 200');

    // Switch back to normal mode
    await page.getByRole('button', { name: 'Exit Focus Mode' }).click();
    await page.waitForURL('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Make more changes in normal mode
    await clearAndTypeInExpressionEditor(page, 't * 300');

    // Switch to focus mode again
    await page.getByRole('button', { name: 'Enter Focus Mode' }).click();
    await page.waitForURL('/create/focus');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });
    await dismissFocusHint(page);

    // Verify final state
    await expect(page.locator('.cm-content')).toContainText('t * 300');
    await expect(await getTitleValue(page)).toBe('Rapid Switch Test');
  });
});

test.describe('Focus mode keyboard shortcuts', () => {
  test('Ctrl+Shift+F switches to focus mode from create', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Make some changes
    await clearAndTypeInExpressionEditor(page, 't * 50');

    // Use keyboard shortcut
    await page.keyboard.press('Control+Shift+F');
    await page.waitForURL('/create/focus');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify changes are preserved
    await expect(page.locator('.cm-content')).toContainText('t * 50');
  });

  test('Ctrl+Shift+F switches to focus mode from edit', async ({ page }) => {
    await page.goto(`/edit/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Make some changes
    await clearAndTypeInExpressionEditor(page, 't * 60');

    // Use keyboard shortcut
    await page.keyboard.press('Control+Shift+F');
    await page.waitForURL(`/edit/${existingPostId}/focus`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify changes are preserved
    await expect(page.locator('.cm-content')).toContainText('t * 60');
  });

  test('Ctrl+Shift+F switches back to normal mode from focus', async ({ page }) => {
    await page.goto('/create/focus');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Make some changes
    await clearAndTypeInExpressionEditor(page, 't * 70');

    // Use keyboard shortcut
    await page.keyboard.press('Control+Shift+F');
    await page.waitForURL('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify changes are preserved
    await expect(page.locator('.cm-content')).toContainText('t * 70');
  });
});
