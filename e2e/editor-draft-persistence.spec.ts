import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { signInAndInjectSession } from './utils/auth';
import { clearAndTypeInExpressionEditor, setTitle, getTitleValue } from './utils/editor-helpers';

const TEST_USER_EMAIL = 'e2e+draft-persist@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_persist_user';

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
      title: 'Test Post',
      description: 'Test description',
      expression: 't >> 4',
      is_draft: false,
      sample_rate: 8000,
      mode: 'uint8',
    })
    .select('id')
    .single();

  existingPostId = data!.id;
});

test.describe('Draft persistence across page reloads', () => {
  test('create draft persists after page reload', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Create a draft
    await clearAndTypeInExpressionEditor(page, 't >> 4');
    await setTitle(page, 'Reload Test');
    const descField = page.getByPlaceholder('Add an optional description');
    await descField.fill('Testing persistence');

    // Change mode and sample rate
    await page.getByRole('button', { name: 'uint8' }).click();
    await expect(page.getByRole('button', { name: 'int8' })).toBeVisible();

    // Reload the page
    await page.reload();
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify all fields are restored
    await expect(await getTitleValue(page)).toBe('Reload Test');
    await expect(descField).toHaveValue('Testing persistence');
    await expect(page.locator('.cm-content')).toContainText('t >> 4');
    await expect(page.getByRole('button', { name: 'int8' })).toBeVisible();
  });

  test('edit draft persists after page reload', async ({ page }) => {
    await page.goto(`/edit/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Make changes
    await clearAndTypeInExpressionEditor(page, 't * 10');
    await setTitle(page, 'Edited and Reloaded');

    // Reload the page
    await page.reload();
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify changes are restored
    await expect(await getTitleValue(page)).toBe('Edited and Reloaded');
    await expect(page.locator('.cm-content')).toContainText('t * 10');
  });

  test('fork draft persists after page reload', async ({ page }) => {
    await page.goto(`/fork/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Make changes
    await clearAndTypeInExpressionEditor(page, 't * 15');
    await setTitle(page, 'Forked and Reloaded');

    // Reload the page
    await page.reload();
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify changes are restored
    await expect(await getTitleValue(page)).toBe('Forked and Reloaded');
    await expect(page.locator('.cm-content')).toContainText('t * 15');
  });

  test('create focus draft persists after page reload', async ({ page }) => {
    await page.goto('/create/focus');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Create a draft
    await clearAndTypeInExpressionEditor(page, 't & 127');
    await setTitle(page, 'Focus Reload Test');

    // Reload the page
    await page.reload();
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify fields are restored
    await expect(await getTitleValue(page)).toBe('Focus Reload Test');
    await expect(page.locator('.cm-content')).toContainText('t & 127');
  });
});

test.describe('Draft persistence across navigation', () => {
  test('create draft persists after navigating away and back', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Create a draft
    await clearAndTypeInExpressionEditor(page, 't * 20');
    await setTitle(page, 'Navigation Test');

    // Navigate away
    await page.goto('/explore');
    await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();

    // Navigate back
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify draft is restored
    await expect(await getTitleValue(page)).toBe('Navigation Test');
    await expect(page.locator('.cm-content')).toContainText('t * 20');
  });

  test('edit draft persists after navigating to profile and back', async ({ page }) => {
    await page.goto(`/edit/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Make changes
    await clearAndTypeInExpressionEditor(page, 't * 25');
    await setTitle(page, 'Edit Nav Test');

    // Navigate to profile
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: TEST_USERNAME })).toBeVisible();

    // Navigate back to edit
    await page.goto(`/edit/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify changes are restored
    await expect(await getTitleValue(page)).toBe('Edit Nav Test');
    await expect(page.locator('.cm-content')).toContainText('t * 25');
  });

  test('draft persists when switching between focus and normal mode multiple times', async ({
    page,
  }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Create initial draft
    await clearAndTypeInExpressionEditor(page, 't * 30');
    await setTitle(page, 'Multi Switch Test');

    // Switch to focus mode
    await page.getByRole('button', { name: 'Enter Focus Mode' }).click();
    await page.waitForURL('/create/focus');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Navigate away from focus mode
    await page.goto('/explore');

    // Go back to normal mode
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify draft is still there
    await expect(await getTitleValue(page)).toBe('Multi Switch Test');
    await expect(page.locator('.cm-content')).toContainText('t * 30');
  });
});

test.describe('Draft clearing behavior', () => {
  test('publishing clears create draft', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Create a draft
    await clearAndTypeInExpressionEditor(page, 't * 40');
    await setTitle(page, 'Will Be Published');

    // Publish
    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // Go back to create page
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Draft should be cleared
    await expect(await getTitleValue(page)).toBe('');
    await expect(page.locator('.cm-content')).not.toContainText('t * 40');
  });

  test('publishing fork clears fork draft', async ({ page }) => {
    await page.goto(`/fork/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Create fork changes
    await clearAndTypeInExpressionEditor(page, 't * 45');
    await setTitle(page, 'Published Fork');

    // Publish
    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // Go back to fork page
    await page.goto(`/fork/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Draft should be cleared (should show original post data)
    await expect(await getTitleValue(page)).toBe('Test Post');
    await expect(page.locator('.cm-content')).toContainText('t >> 4');
  });

  test('saving as draft in edit clears localStorage draft', async ({ page }) => {
    await page.goto(`/edit/${existingPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Make changes
    await clearAndTypeInExpressionEditor(page, 't * 50');
    await setTitle(page, 'Draft Save Test');

    // Save as draft (unpublish)
    const overflowTrigger = page.locator('.overflow-menu-trigger');
    await overflowTrigger.click();
    const unpublishButton = page.getByRole('button', { name: 'Unpublish…' });
    await unpublishButton.click();

    // Confirm modal
    const modal = page.locator('.modal');
    await modal.getByRole('button', { name: 'Unpublish' }).click();

    // Wait for save
    await expect(page.getByText('Post saved.')).toBeVisible();

    // Reload page
    await page.reload();
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Should load from database, not localStorage
    await expect(await getTitleValue(page)).toBe('Draft Save Test');
    await expect(page.locator('.cm-content')).toContainText('t * 50');
  });
});

test.describe('Draft auto-save timing', () => {
  test('draft saves automatically while typing', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Type expression
    await clearAndTypeInExpressionEditor(page, 't * 55');

    // Wait a moment for auto-save
    await page.waitForTimeout(500);

    // Check localStorage directly
    const hasDraft = await page.evaluate(() => {
      const draft = localStorage.getItem('bytebeat-cloud-create-draft-v1');
      return draft !== null && draft.includes('t * 55');
    });

    expect(hasDraft).toBe(true);
  });

  test('draft saves when changing metadata', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Change mode
    await page.getByRole('button', { name: 'uint8' }).click();
    await expect(page.getByRole('button', { name: 'int8' })).toBeVisible();

    // Wait for auto-save
    await page.waitForTimeout(500);

    // Check localStorage
    const hasDraft = await page.evaluate(() => {
      const draft = localStorage.getItem('bytebeat-cloud-create-draft-v1');
      return draft !== null && draft.includes('int8');
    });

    expect(hasDraft).toBe(true);
  });
});

test.describe('Draft behavior with browser back/forward', () => {
  test('draft persists when using browser back button', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Create a draft
    await clearAndTypeInExpressionEditor(page, 't * 60');
    await setTitle(page, 'Back Button Test');

    // Navigate to another page
    await page.goto('/explore');
    await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();

    // Use browser back button
    await page.goBack();
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify draft is restored
    await expect(await getTitleValue(page)).toBe('Back Button Test');
    await expect(page.locator('.cm-content')).toContainText('t * 60');
  });

  test('draft persists when using browser forward button', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();

    // Navigate to create and make a draft
    await page.goto('/create');
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await clearAndTypeInExpressionEditor(page, 't * 65');
    await setTitle(page, 'Forward Button Test');

    // Go back
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();

    // Go forward
    await page.goForward();
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify draft is restored
    await expect(await getTitleValue(page)).toBe('Forward Button Test');
    await expect(page.locator('.cm-content')).toContainText('t * 65');
  });
});
