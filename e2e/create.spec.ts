import { test, expect } from '@playwright/test';
import { ensureTestUser, clearProfilesTable, ensureTestUserProfile } from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+create@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_create_user';

// Helper to type into CodeMirror editor
async function typeInExpressionEditor(page: import('@playwright/test').Page, text: string) {
  const editor = page.locator('.expression-input .cm-content');
  await editor.click();
  await page.keyboard.type(text);
}

test.beforeAll(async () => {
  await ensureTestUser({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
});

test.beforeEach(async () => {
  await clearProfilesTable();
});

test.describe('Create page - unauthenticated', () => {
  test.beforeEach(async ({ page }) => {
    await clearSupabaseSession(page);
  });

  test('shows login prompt and hides save actions', async ({ page }) => {
    await page.goto('/create');

    await expect(page.getByText('Log in to publish a post')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    await expect(page.getByLabel('Save as draft')).toHaveCount(0);
  });

  test('can still edit expression and use play button', async ({ page }) => {
    await page.goto('/create');

    await typeInExpressionEditor(page, 't');

    const playButton = page.getByRole('button', { name: 'Play' });
    await expect(playButton).toBeEnabled();
  });
});

test.describe('Create page - authenticated', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('mode option cycles through uint8 -> int8 -> float', async ({ page }) => {
    await page.goto('/create');

    const modeButton = page.getByRole('button', { name: 'uint8' });
    await expect(modeButton).toBeVisible();

    // Click to cycle to int8
    await modeButton.click();
    await expect(page.getByRole('button', { name: 'int8' })).toBeVisible();

    // Click to cycle to float
    await page.getByRole('button', { name: 'int8' }).click();
    await expect(page.getByRole('button', { name: 'float' })).toBeVisible();

    // Click to cycle back to uint8
    await page.getByRole('button', { name: 'float' }).click();
    await expect(page.getByRole('button', { name: 'uint8' })).toBeVisible();
  });

  test('sample rate cycles through presets on click', async ({ page }) => {
    await page.goto('/create');

    // Default is 8000 Hz
    const sampleRateButton = page.getByRole('button', { name: '8kHz' });
    await expect(sampleRateButton).toBeVisible();

    // Click to go to next preset (11025)
    await sampleRateButton.click();
    await expect(page.getByRole('button', { name: '11.025kHz' })).toBeVisible();
  });

  test('description field accepts input', async ({ page }) => {
    await page.goto('/create');

    const descriptionField = page.getByPlaceholder('Add an optional description');
    await expect(descriptionField).toBeVisible();

    await descriptionField.fill('This is a test description');
    await expect(descriptionField).toHaveValue('This is a test description');
  });

  test('save button is disabled when expression is empty', async ({ page }) => {
    await page.goto('/create');

    const saveButton = page.getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeDisabled();
  });

  test('save button is disabled when expression is invalid', async ({ page }) => {
    await page.goto('/create');

    await typeInExpressionEditor(page, 't +'); // Invalid: trailing operator

    const saveButton = page.getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeDisabled();

    // Should show validation error
    await expect(page.locator('.expression-preview')).toBeVisible();
  });

  test('save button is enabled when expression is valid', async ({ page }) => {
    await page.goto('/create');

    await typeInExpressionEditor(page, 't');

    const saveButton = page.getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeEnabled();
  });

  test('saving as draft shows success message and stays on page', async ({ page }) => {
    await page.goto('/create');

    // Fill in expression
    await typeInExpressionEditor(page, 't * 2');

    // Check "Save as draft"
    const draftCheckbox = page.getByLabel('Save as draft');
    await draftCheckbox.check();

    // Save
    const saveButton = page.getByRole('button', { name: 'Save' });
    await saveButton.click();

    // Should show success message and stay on create page
    await expect(page.getByText('Post saved.')).toBeVisible();
    await expect(page).toHaveURL('/create');
  });

  test('saving public post redirects to post detail page', async ({ page }) => {
    await page.goto('/create');

    // Fill in title
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.fill('E2E Test Post');

    // Fill in expression
    await typeInExpressionEditor(page, 't >> 4');

    // Ensure "Save as draft" is unchecked (default)
    const draftCheckbox = page.getByLabel('Save as draft');
    await expect(draftCheckbox).not.toBeChecked();

    // Save
    const saveButton = page.getByRole('button', { name: 'Save' });
    await saveButton.click();

    // Should redirect to post detail page
    await page.waitForURL(/\/post\/[a-f0-9-]+/);
    await expect(page.getByRole('heading', { name: 'E2E Test Post' })).toBeVisible();
  });

  test('title field accepts input', async ({ page }) => {
    await page.goto('/create');

    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.fill('My Test Title');
    await expect(titleField).toHaveValue('My Test Title');
  });

  test('play button is disabled when expression is invalid', async ({ page }) => {
    await page.goto('/create');

    const playButton = page.getByRole('button', { name: 'Play' });

    // Empty expression
    await expect(playButton).toBeDisabled();

    // Invalid expression
    await typeInExpressionEditor(page, 't +');
    await expect(playButton).toBeDisabled();
  });

  test('play button is enabled when expression is valid', async ({ page }) => {
    await page.goto('/create');

    await typeInExpressionEditor(page, 't');

    const playButton = page.getByRole('button', { name: 'Play' });
    await expect(playButton).toBeEnabled();
  });

  test('saving post with tags in description shows clickable tags on detail page', async ({
    page,
  }) => {
    await page.goto('/create');

    // Fill in title
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.fill('Post With Tags');

    // Fill in description with tags
    const descriptionField = page.getByPlaceholder('Add an optional description');
    await descriptionField.fill('Check out this #bytebeat #music creation!');

    // Fill in expression
    await typeInExpressionEditor(page, 't * 3');

    // Save
    const saveButton = page.getByRole('button', { name: 'Post saved' });
    await saveButton.click();

    // Should redirect to post detail page
    await page.waitForURL(/\/post\/[a-f0-9-]+/);

    // Verify tags are visible - both as chips and in description
    const bytebeatTags = page.getByRole('link', { name: '#bytebeat' });
    const musicTags = page.getByRole('link', { name: '#music' });

    await expect(bytebeatTags).toHaveCount(2); // chip + description
    await expect(musicTags).toHaveCount(2);

    // Click on the tag in the description
    const descriptionBytebeatTag = page.locator('.post-description-detail').getByRole('link', { name: '#bytebeat' });
    await descriptionBytebeatTag.click();
    await page.waitForURL(/\/tags\/bytebeat/);
    await expect(page.getByRole('heading', { name: '#bytebeat' })).toBeVisible();
  });
});
