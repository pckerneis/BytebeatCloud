import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+reporting@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_reporting_user';

const OTHER_USER_EMAIL = 'e2e+reporting_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_reporting_other';

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

  // Clean up reports and posts
  await supabaseAdmin.from('post_report_notes').delete().not('id', 'is', null);
  await supabaseAdmin.from('post_reports').delete().not('id', 'is', null);
  await supabaseAdmin.from('report_notes').delete().not('id', 'is', null);
  await supabaseAdmin.from('user_reports').delete().not('id', 'is', null);
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', otherUserId);
});

test.describe('Reporting users', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('can report a user from user actions page', async ({ page }) => {
    await page.goto(`/user-actions/${OTHER_USERNAME}`);

    const reportButton = page.getByRole('button', { name: 'Report user' });
    await expect(reportButton).toBeVisible({ timeout: 10000 });

    await reportButton.click();

    // Modal should open
    await expect(page.getByRole('heading', { name: 'Report user' })).toBeVisible();

    // Select a reason
    await page.locator('select').selectOption('Spam');

    // Submit
    await page.getByRole('button', { name: 'Submit report' }).click();

    // Button should change to "Reported"
    await expect(page.getByRole('button', { name: 'Reported' })).toBeVisible({ timeout: 5000 });
  });

  test('cannot submit report without selecting reason', async ({ page }) => {
    await page.goto(`/user-actions/${OTHER_USERNAME}`);

    await page.getByRole('button', { name: 'Report user' }).click();

    // Submit button should be disabled
    const submitButton = page.getByRole('button', { name: 'Submit report' });
    await expect(submitButton).toBeDisabled();
  });

  test('Other reason requires details', async ({ page }) => {
    await page.goto(`/user-actions/${OTHER_USERNAME}`);

    await page.getByRole('button', { name: 'Report user' }).click();

    // Select "Other"
    await page.locator('select').selectOption('Other');

    // Submit button should be disabled without details
    const submitButton = page.getByRole('button', { name: 'Submit report' });
    await expect(submitButton).toBeDisabled();

    // Add details
    await page.locator('textarea').fill('Custom reason details');

    // Now submit should be enabled
    await expect(submitButton).toBeEnabled();
  });

  test('can report and block simultaneously', async ({ page }) => {
    await page.goto(`/user-actions/${OTHER_USERNAME}`);

    await page.getByRole('button', { name: 'Report user' }).click();

    // Select a reason
    await page.locator('select').selectOption('Harassment');

    // Check the block checkbox
    await page.getByLabel(/also block/i).check();

    // Submit
    await page.getByRole('button', { name: 'Submit report' }).click();

    // Both should update
    await expect(page.getByRole('button', { name: 'Reported' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Unblock user' })).toBeVisible();
  });

  test('report appears in update-profile page', async ({ page }) => {
    // Create a report
    await supabaseAdmin.from('user_reports').insert({
      reporter_id: testUserId,
      reported_id: otherUserId,
      reason: 'Spam',
      status: 'received',
    });

    await page.goto('/update-profile');

    // Should see reports section
    await expect(page.getByRole('heading', { name: 'My user reports' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(`@${OTHER_USERNAME}`)).toBeVisible();
    await expect(page.getByText('Reason: Spam')).toBeVisible();
  });

  test('can add note to user report', async ({ page }) => {
    // Create a report
    await supabaseAdmin.from('user_reports').insert({
      reporter_id: testUserId,
      reported_id: otherUserId,
      reason: 'Harassment',
      status: 'received',
    });

    await page.goto('/update-profile');

    // Expand notes
    await page.getByRole('button', { name: /Notes/ }).click();

    // Add a note
    await page.locator('textarea[placeholder="Add a note..."]').first().fill('Additional context');
    await page.getByRole('button', { name: 'Add note' }).first().click();

    // Note should appear
    await expect(page.getByText('Additional context')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Reporting posts', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create a post by other user
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post To Report',
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
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('can report a post from post detail page', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    const reportButton = page.getByRole('button', { name: 'Report' });
    await expect(reportButton).toBeVisible();

    await reportButton.click();

    // Modal should open
    await expect(page.getByRole('heading', { name: 'Report post' })).toBeVisible();

    // Select a reason
    await page.locator('select').selectOption('Spam');

    // Submit
    await page.getByRole('button', { name: 'Submit report' }).click();

    // Button should change to "Reported"
    await expect(page.getByRole('button', { name: 'Reported' })).toBeVisible({ timeout: 5000 });
  });

  test('cannot submit post report without selecting reason', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await page.getByRole('button', { name: 'Report' }).click();

    // Submit button should be disabled
    const submitButton = page.getByRole('button', { name: 'Submit report' });
    await expect(submitButton).toBeDisabled();
  });

  test('Other reason requires details for post report', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    await page.getByRole('button', { name: 'Report' }).click();

    // Select "Other"
    await page.locator('select').selectOption('Other');

    // Submit button should be disabled without details
    const submitButton = page.getByRole('button', { name: 'Submit report' });
    await expect(submitButton).toBeDisabled();

    // Add details
    await page.getByPlaceholder('Additional details...').fill('Custom reason details');

    // Now submit should be enabled
    await expect(submitButton).toBeEnabled();
  });

  test('report button not visible for own post', async ({ page }) => {
    // Create own post
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'My Own Post',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await page.goto(`/post/${data!.id}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Report button should not be visible for own post
    await expect(page.getByRole('button', { name: 'Report' })).not.toBeVisible();
  });

  test('post report appears in update-profile page', async ({ page }) => {
    // Create a post report
    await supabaseAdmin.from('post_reports').insert({
      reporter_id: testUserId,
      post_id: testPostId,
      reason: 'Malicious code',
      status: 'received',
    });

    await page.goto('/update-profile');

    // Should see post reports section
    await expect(page.getByRole('heading', { name: 'My post reports' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('Post To Report')).toBeVisible();
    await expect(page.getByText('Reason: Malicious code')).toBeVisible();
  });

  test('can add note to post report', async ({ page }) => {
    // Create a post report
    await supabaseAdmin.from('post_reports').insert({
      reporter_id: testUserId,
      post_id: testPostId,
      reason: 'Copyright violation',
      status: 'received',
    });

    await page.goto('/update-profile');

    // Expand notes for post report (second notes button)
    const notesButtons = page.getByRole('button', { name: /Notes/ });
    await notesButtons.last().click();

    // Add a note
    await page
      .locator('textarea[placeholder="Add a note..."]')
      .last()
      .fill('More info about violation');
    await page.getByRole('button', { name: 'Add note' }).last().click();

    // Note should appear
    await expect(page.getByText('More info about violation')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Reporting - unauthenticated', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post For Unauth Test',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    testPostId = data!.id;

    await clearSupabaseSession(page);
  });

  test('report button not visible on post detail when not logged in', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Report button should not be visible
    await expect(page.getByRole('button', { name: 'Report' })).not.toBeVisible();
  });
});
