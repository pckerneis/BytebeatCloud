import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+mentions@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_mentions_user';

const OTHER_USER_EMAIL = 'e2e+mentions_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_mentions_other';

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

test.describe('Mentions on create page', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
  });

  test('mention is converted to ID format on save and displayed correctly', async ({ page }) => {
    await page.goto('/create');

    await typeInExpressionEditor(page, 't');

    const descriptionField = page.getByPlaceholder('Add an optional description');
    await descriptionField.fill(`Check out @${OTHER_USERNAME}!`);

    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // Verify mention is displayed with username
    const description = page.locator('.post-description-detail');
    await expect(description.getByRole('link', { name: `@${OTHER_USERNAME}` })).toBeVisible();

    // Verify the stored format contains the user ID
    const postId = page.url().split('/post/')[1];
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('description')
      .eq('id', postId)
      .single();

    expect(post!.description).toContain(`@[${otherUserId}]`);
    expect(post!.description).not.toContain(`@${OTHER_USERNAME}`);
  });

  test('multiple mentions are all converted', async ({ page }) => {
    // Create a third user
    const thirdUser = await ensureTestUser({
      email: 'e2e+mentions_third@example.com',
      password: 'password123',
    });
    await ensureTestUserProfile('e2e+mentions_third@example.com', 'e2e_third_user');

    await page.goto('/create');

    await typeInExpressionEditor(page, 't');

    const descriptionField = page.getByPlaceholder('Add an optional description');
    await descriptionField.fill(`Thanks @${OTHER_USERNAME} and @e2e_third_user!`);

    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // Verify both mentions are displayed
    const description = page.locator('.post-description-detail');
    await expect(description.getByRole('link', { name: `@${OTHER_USERNAME}` })).toBeVisible();
    await expect(description.getByRole('link', { name: '@e2e_third_user' })).toBeVisible();

    // Verify stored format
    const postId = page.url().split('/post/')[1];
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('description')
      .eq('id', postId)
      .single();

    expect(post!.description).toContain(`@[${otherUserId}]`);
    expect(post!.description).toContain(`@[${thirdUser.id}]`);

    // Cleanup
    await supabaseAdmin.from('profiles').delete().eq('id', thirdUser.id);
  });

  test('non-existent username is kept as-is', async ({ page }) => {
    await page.goto('/create');

    await typeInExpressionEditor(page, 't');

    const descriptionField = page.getByPlaceholder('Add an optional description');
    await descriptionField.fill('Hello @nonexistent_user_xyz!');

    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // Verify stored format keeps the username (not converted)
    const postId = page.url().split('/post/')[1];
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('description')
      .eq('id', postId)
      .single();

    expect(post!.description).toContain('@nonexistent_user_xyz');
    expect(post!.description).not.toMatch(/@\[[0-9a-f-]+]/);
  });
});

test.describe('Mentions on edit page', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
  });

  test('mention IDs are converted back to usernames when loading', async ({ page }) => {
    // Create a post with stored mention format
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Post With Mention',
        description: `Check out @[${otherUserId}] for more!`,
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await page.goto(`/edit/${post!.id}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify the description field shows username, not ID
    const descriptionField = page.getByPlaceholder('Add an optional description');
    await expect(descriptionField).toHaveValue(`Check out @${OTHER_USERNAME} for more!`);
  });

  test('edited mention is re-converted to ID format on save', async ({ page }) => {
    // Create a post without mentions
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Post Without Mention',
        description: 'Original description',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await page.goto(`/edit/${post!.id}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Add a mention
    const descriptionField = page.getByPlaceholder('Add an optional description');
    await descriptionField.clear();
    await descriptionField.fill(`Updated with @${OTHER_USERNAME}!`);

    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // Verify stored format
    const { data: updatedPost } = await supabaseAdmin
      .from('posts')
      .select('description')
      .eq('id', post!.id)
      .single();

    expect(updatedPost!.description).toContain(`@[${otherUserId}]`);
  });

  test('existing mention is preserved when editing other fields', async ({ page }) => {
    // Create a post with stored mention format
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Post With Mention',
        description: `Thanks @[${otherUserId}]!`,
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await page.goto(`/edit/${post!.id}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Only change the title
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.clear();
    await titleField.fill('Updated Title');

    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // Verify mention is still stored correctly
    const { data: updatedPost } = await supabaseAdmin
      .from('posts')
      .select('description')
      .eq('id', post!.id)
      .single();

    expect(updatedPost!.description).toContain(`@[${otherUserId}]`);
  });
});

test.describe('Mentions on fork page', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
  });

  test('mention IDs from original post are converted to usernames', async ({ page }) => {
    // Create a post by other user with mention
    const { data: originalPost } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Original Post',
        description: `Shoutout to @[${testUserId}]!`,
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await page.goto(`/fork/${originalPost!.id}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify the description field shows username
    const descriptionField = page.getByPlaceholder('Add an optional description');
    await expect(descriptionField).toHaveValue(`Shoutout to @${TEST_USERNAME}!`);
  });

  test('new mention in fork is converted to ID format', async ({ page }) => {
    // Create a post by other user without mention
    const { data: originalPost } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Original Post',
        description: 'No mentions here',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    await page.goto(`/fork/${originalPost!.id}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Add a mention in the fork
    const descriptionField = page.getByPlaceholder('Add an optional description');
    await descriptionField.clear();
    await descriptionField.fill(`Forked! Thanks @${OTHER_USERNAME}!`);

    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForURL(/\/post\//);

    // Verify stored format in the fork
    const postId = page.url().split('/post/')[1];
    const { data: fork } = await supabaseAdmin
      .from('posts')
      .select('description')
      .eq('id', postId)
      .single();

    expect(fork!.description).toContain(`@[${otherUserId}]`);
  });
});

test.describe('Mentions - username changes', () => {
  test('mention link still works after user changes username', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    // Create a post with mention
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'Post With Mention',
        description: `Check out @[${otherUserId}]!`,
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    // Change the other user's username
    await supabaseAdmin
      .from('profiles')
      .update({ username: 'e2e_new_username' })
      .eq('id', otherUserId);

    await page.goto(`/post/${post!.id}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Verify mention shows the NEW username
    const description = page.locator('.post-description-detail');
    await expect(description.getByRole('link', { name: '@e2e_new_username' })).toBeVisible();

    // Click should navigate to the user's profile with new username
    await description.getByRole('link', { name: '@e2e_new_username' }).click();
    await page.waitForURL('/u/e2e_new_username');
  });
});
