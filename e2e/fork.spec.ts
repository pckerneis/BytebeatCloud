import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+fork@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_fork_user';

const OTHER_USER_EMAIL = 'e2e+fork_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_fork_other';

let testUserId: string;
let otherUserId: string;

// Helper to type into CodeMirror editor
async function typeInExpressionEditor(page: import('@playwright/test').Page, text: string) {
  const editor = page.locator('.expression-input .cm-content');
  await editor.click();
  await page.keyboard.type(text);
}

// Helper to clear and type in CodeMirror editor
async function clearAndTypeInExpressionEditor(page: import('@playwright/test').Page, text: string) {
  const editor = page.locator('.expression-input .cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
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

  test('saving fork redirects to new post detail page', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Modify title to make it unique
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.clear();
    await titleField.fill('My Forked Post');

    // Save
    const saveButton = page.getByRole('button', { name: 'Save' });
    await saveButton.click();

    // Should redirect to new post detail (not the original)
    await page.waitForURL(/\/post\/(?!.*originalPostId)/);

    // Verify it's the forked post
    await expect(page.getByRole('link', { name: 'My Forked Post' })).toBeVisible();
  });

  test('forked post shows forked from attribution on detail page', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Save without changes
    const saveButton = page.getByRole('button', { name: 'Save' });
    await saveButton.click();

    await page.waitForURL(/\/post\//);

    // Should show "Forked from" attribution in the fork-link
    const forkLink = page.locator('.fork-link');
    await expect(forkLink).toBeVisible();
    await expect(forkLink).toContainText('Forked from Original Post');
    await expect(forkLink).toContainText(`@${OTHER_USERNAME}`);
  });

  test('can modify expression before saving fork', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Modify expression
    await clearAndTypeInExpressionEditor(page, 't * 5');

    // Save
    const saveButton = page.getByRole('button', { name: 'Save' });
    await saveButton.click();

    await page.waitForURL(/\/post\//);

    // Verify modified expression
    await expect(page.locator('.cm-content')).toContainText('t*5');
  });

  test('saving fork as draft stays on fork page', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Check "Save as draft"
    const draftCheckbox = page.getByLabel('Save as draft');
    await draftCheckbox.check();

    // Save
    const saveButton = page.getByRole('button', { name: 'Save' });
    await saveButton.click();

    // Should stay on fork page and show success
    await expect(page).toHaveURL(/\/fork\//);
    await expect(page.getByText('Fork saved.')).toBeVisible();
  });

  test('save button disabled with invalid expression', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Enter invalid expression
    await clearAndTypeInExpressionEditor(page, 't +');

    // Save button should be disabled
    const saveButton = page.getByRole('button', { name: 'Save' });
    await expect(saveButton).toBeDisabled();
  });
});

test.describe('Fork page - forked post appears in original forks list', () => {
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

  test('forked post appears in original post forks section', async ({ page }) => {
    // First, create the fork
    await page.goto(`/fork/${originalPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.clear();
    await titleField.fill('My New Fork');

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(/\/post\//);

    // Now navigate to original post
    await page.goto(`/post/${originalPostId}`);
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Forks section should show the fork
    await expect(page.getByRole('link', { name: 'My New Fork' })).toBeVisible();
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
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    await expect(page.getByLabel('Save as draft')).toHaveCount(0);
  });

  test('can still view original post data', async ({ page }) => {
    await page.goto(`/fork/${originalPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Can see the pre-filled data
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await expect(titleField).toHaveValue('Original Post Unauth');
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

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(/\/post\//);

    await expect(page.getByRole('link', { name: 'Fork Of My Own Post' })).toBeVisible();
    await expect(page.getByText(/Forked from/)).toBeVisible();
  });
});
