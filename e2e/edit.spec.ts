import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+edit@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_edit_user';

const OTHER_USER_EMAIL = 'e2e+edit_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_edit_other';

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
  // Select all and delete
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

test.describe('Edit page - loading existing post', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Original Title',
        description: 'Original description',
        expression: 't >> 4',
        is_draft: false,
        sample_rate: 11025,
        mode: 'int8',
      })
      .select('id')
      .single();

    testPostId = data!.id;

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
  });

  test('loads existing post data into form', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);

    // Wait for loading to finish
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify title is loaded
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await expect(titleField).toHaveValue('Original Title');

    // Verify description is loaded
    const descriptionField = page.getByPlaceholder('Add an optional description');
    await expect(descriptionField).toHaveValue('Original description');

    // Verify mode is loaded
    await expect(page.getByRole('button', { name: 'int8' })).toBeVisible();

    // Verify sample rate is loaded
    await expect(page.getByRole('button', { name: '11.025kHz' })).toBeVisible();

    // Verify expression is loaded (CodeMirror shows the text)
    await expect(page.locator('.cm-content')).toContainText('t >> 4');
  });

  test('shows back button', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByRole('button', { name: '← Back' })).toBeVisible();
  });

  test('shows delete button', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
  });
});

test.describe('Edit page - saving changes', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Post To Edit',
        description: '',
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

  test('can edit title and save', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Change title
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.clear();
    await titleField.fill('Updated Title');

    // Save (public post redirects to detail page)
    const saveButton = page.getByRole('button', { name: 'Changes saved' });
    await saveButton.click();

    // Should redirect to post detail
    await page.waitForURL(/\/post\//);

    // Verify updated title is shown
    await expect(page.getByRole('link', { name: 'Updated Title' })).toBeVisible();
  });

  test('can edit description and save', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Add description
    const descriptionField = page.getByPlaceholder('Add an optional description');
    await descriptionField.fill('New description added');

    // Save
    const saveButton = page.getByRole('button', { name: 'Changes saved' });
    await saveButton.click();

    // Should redirect to post detail
    await page.waitForURL(/\/post\//);

    // Verify description is shown
    await expect(page.locator('.post-description-detail')).toContainText('New description added');
  });

  test('can change mode and save', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Change mode from uint8 to int8
    await page.getByRole('button', { name: 'uint8' }).click();
    await expect(page.getByRole('button', { name: 'int8' })).toBeVisible();

    // Save
    const saveButton = page.getByRole('button', { name: 'Changes saved' });
    await saveButton.click();

    await page.waitForURL(/\/post\//);

    // Verify mode chip shows int8
    await expect(page.locator('.chip.mode')).toHaveText('int8');
  });

  test('can change expression and save', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Change expression
    await clearAndTypeInExpressionEditor(page, 't * 5');

    // Save
    const saveButton = page.getByRole('button', { name: 'Changes saved' });
    await saveButton.click();

    await page.waitForURL(/\/post\//);

    // Verify expression is updated
    await expect(page.locator('.cm-content')).toContainText('t * 5');
  });

  test('saving as draft stays on edit page', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Check "Save as draft"
    const draftCheckbox = page.getByLabel('Save as draft');
    await draftCheckbox.check();

    // Save
    const saveButton = page.getByRole('button', { name: 'Changes saved' });
    await saveButton.click();

    // Should stay on edit page and show success message
    await expect(page).toHaveURL(/\/edit\//);
    await expect(page.getByText('Changes saved.')).toBeVisible();
  });

  test('save button disabled with invalid expression', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Enter invalid expression
    await clearAndTypeInExpressionEditor(page, 't +');

    // Save button should be disabled
    const saveButton = page.getByRole('button', { name: 'Changes saved' });
    await expect(saveButton).toBeDisabled();
  });
});

test.describe('Edit page - delete', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Post To Delete',
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

  test('delete button shows confirmation modal', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click delete button
    await page.getByRole('button', { name: 'Delete' }).click();

    // Modal should appear
    await expect(page.getByRole('heading', { name: 'Delete post' })).toBeVisible();
    await expect(
      page.getByText('Are you sure you want to delete this post permanently?'),
    ).toBeVisible();

    // Modal has Cancel and Delete buttons
    await expect(page.locator('.modal').getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.locator('.modal').getByRole('button', { name: 'Delete' })).toBeVisible();
  });

  test('cancel button closes delete modal', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Open modal
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.modal')).toBeVisible();

    // Click cancel
    await page.locator('.modal').getByRole('button', { name: 'Cancel' }).click();

    // Modal should close
    await expect(page.locator('.modal')).toHaveCount(0);
  });

  test('confirming delete removes post and redirects to profile', async ({ page }) => {
    await page.goto(`/edit/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Open modal and confirm delete
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.locator('.modal').getByRole('button', { name: 'Delete' }).click();

    // Should redirect to profile
    await page.waitForURL('/profile');

    // Post should no longer exist - navigate to it and see error
    await page.goto(`/post/${testPostId}`);
    await expect(page.getByText('Post not found.')).toBeVisible();
  });
});

test.describe('Edit page - permissions', () => {
  test('cannot edit other users post', async ({ page }) => {
    // Create post by other user
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Other User Post',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Sign in as test user (not the owner)
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    await page.goto(`/edit/${data!.id}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Should show permission error
    await expect(page.getByText('You do not have permission to edit this post.')).toBeVisible();
  });

  test('shows error for non-existent post', async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    await page.goto('/edit/00000000-0000-0000-0000-000000000000');

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByText('Post not found.')).toBeVisible();
  });
});
