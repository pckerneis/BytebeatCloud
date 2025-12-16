import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+comments@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_comments_user';

const OTHER_USER_EMAIL = 'e2e+comments_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_comments_other';

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

  // Clean up comments, notifications, and posts
  await supabaseAdmin.from('comments').delete().not('id', 'is', null);
  await supabaseAdmin.from('notifications').delete().not('id', 'is', null);
  await supabaseAdmin.from('posts').delete().eq('profile_id', testUserId);
  await supabaseAdmin.from('posts').delete().eq('profile_id', otherUserId);
});

test.describe('Comments - basic functionality', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    // Create a post by other user
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post With Comments',
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

  test('can add a comment to a post', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Comments tab should be active by default
    await expect(page.locator('.tab-button.active')).toContainText('Comments');

    // Add a comment
    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    await expect(textarea).toBeVisible();
    await textarea.fill('This is a test comment');

    await page.getByRole('button', { name: 'Post comment' }).click();

    // Comment should appear in the list
    await expect(page.getByText('This is a test comment')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.comment-author').getByText(`@${TEST_USERNAME}`)).toBeVisible();
  });

  test('can delete own comment with confirmation', async ({ page }) => {
    // Pre-create a comment
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: testUserId,
      content: 'Comment to delete',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Comment should be visible
    await expect(page.getByText('Comment to delete')).toBeVisible({ timeout: 5000 });

    // Delete button should be visible for own comment
    const deleteButton = page.getByRole('button', { name: 'Delete' });
    await expect(deleteButton).toBeVisible();

    await deleteButton.click();

    // Confirmation modal should appear
    await expect(page.getByText('Delete comment?')).toBeVisible();
    await expect(page.getByText('This action cannot be undone.')).toBeVisible();

    // Confirm deletion
    await page.locator('.modal').getByRole('button', { name: 'Delete' }).click();

    // Comment should disappear
    await expect(page.getByText('Comment to delete')).not.toBeVisible({ timeout: 5000 });
  });

  test('can cancel comment deletion', async ({ page }) => {
    // Pre-create a comment
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: testUserId,
      content: 'Comment to keep',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Comment should be visible
    await expect(page.getByText('Comment to keep')).toBeVisible({ timeout: 5000 });

    // Click delete
    await page.getByRole('button', { name: 'Delete' }).click();

    // Confirmation modal should appear
    await expect(page.getByText('Delete comment?')).toBeVisible();

    // Cancel deletion
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Modal should close and comment should still be visible
    await expect(page.getByText('Delete comment?')).not.toBeVisible();
    await expect(page.getByText('Comment to keep')).toBeVisible();
  });

  test('cannot delete other user comment', async ({ page }) => {
    // Pre-create a comment by other user
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: otherUserId,
      content: 'Other user comment',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Comment should be visible
    await expect(page.getByText('Other user comment')).toBeVisible({ timeout: 5000 });

    // Delete button should NOT be visible for other user's comment
    await expect(page.getByRole('button', { name: 'Delete' })).not.toBeVisible();
  });

  test('comment count updates in tab header', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Initially 0 comments
    await expect(page.locator('.tab-button.active')).toContainText('Comments (0)');

    // Add a comment
    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    await textarea.fill('New comment');
    await page.getByRole('button', { name: 'Post comment' }).click();

    // Count should update to 1
    await expect(page.locator('.tab-button.active')).toContainText('Comments (1)', { timeout: 5000 });
  });

  test('can switch between Comments and Lineage tabs', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Comments tab active by default
    await expect(page.locator('.tab-button.active')).toContainText('Comments');

    // Click Lineage tab
    await page.locator('.tab-button').filter({ hasText: 'Lineage' }).click();

    // Lineage tab should now be active
    await expect(page.locator('.tab-button').filter({ hasText: 'Lineage' })).toHaveClass(/active/);
  });
});

test.describe('Comments - mentions', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);

    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post For Mention Test',
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

  test('mentions are rendered as links in comments', async ({ page }) => {
    // Pre-create a comment with a mention (stored format)
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: testUserId,
      content: `Hello @[${otherUserId}]!`,
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // The mention should be rendered as a link with username
    const mentionLink = page.locator('.comment-content .mention-link');
    await expect(mentionLink).toBeVisible({ timeout: 5000 });
    await expect(mentionLink).toHaveText(`@${OTHER_USERNAME}`);
  });

  test('tags are rendered as links in comments', async ({ page }) => {
    // Pre-create a comment with a tag
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: testUserId,
      content: 'Check out #bytebeat!',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // The tag should be rendered as a link
    const tagLink = page.locator('.comment-content .tag-link');
    await expect(tagLink).toBeVisible({ timeout: 5000 });
    await expect(tagLink).toHaveText('#bytebeat');
  });
});

test.describe('Comments - notifications', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    // Create a post by other user
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post For Notification Test',
        expression: 't',
        is_draft: false,
        sample_rate: 8000,
        mode: 'uint8',
      })
      .select('id')
      .single();

    testPostId = data!.id;
  });

  test('commenting creates notification for post author', async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Add a comment
    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    await textarea.fill('Nice post!');
    await page.getByRole('button', { name: 'Post comment' }).click();

    // Wait for comment to appear
    await expect(page.getByText('Nice post!')).toBeVisible({ timeout: 5000 });

    // Wait a bit for the database trigger to execute
    await page.waitForTimeout(500);

    // Check notification was created for post author
    const { data: notifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', otherUserId)
      .eq('actor_id', testUserId)
      .eq('event_type', 'comment')
      .eq('post_id', testPostId);

    expect(notifications).toHaveLength(1);
  });

  test('mentioning user in comment creates notification', async ({ page }) => {
    // Create a third user to mention
    const thirdUser = await ensureTestUser({
      email: 'e2e+comments_third@example.com',
      password: 'password123',
    });
    await ensureTestUserProfile('e2e+comments_third@example.com', 'e2e_comments_third');

    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Add a comment with mention
    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    await textarea.fill('Hey @e2e_comments_third check this out!');
    await page.getByRole('button', { name: 'Post comment' }).click();

    // Wait for comment to appear
    await expect(page.getByText('check this out!')).toBeVisible({ timeout: 5000 });

    // Wait a bit for the database trigger to execute
    await page.waitForTimeout(500);

    // Verify the comment was stored with the mention converted to @[userId] format
    const { data: storedComment } = await supabaseAdmin
      .from('comments')
      .select('content')
      .eq('post_id', testPostId)
      .single();

    // The mention should have been converted to @[userId] format
    expect(storedComment?.content).toContain(`@[${thirdUser.id}]`);

    // Check notification was created for mentioned user
    const { data: notifications } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', thirdUser.id)
      .eq('actor_id', testUserId)
      .eq('event_type', 'comment_mention')
      .eq('post_id', testPostId);

    expect(notifications).toHaveLength(1);
  });
});

test.describe('Comments - post owner can delete others comments', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    // Create a post by TEST user (they are the post owner)
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: testUserId,
        title: 'My Post With Comments',
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

  test('post owner can delete other users comment', async ({ page }) => {
    // Pre-create a comment by OTHER user on TEST user's post
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: otherUserId,
      content: 'Comment from other user',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Comment should be visible
    await expect(page.getByText('Comment from other user')).toBeVisible({ timeout: 5000 });

    // Delete button should be visible for post owner
    const deleteButton = page.getByRole('button', { name: 'Delete' });
    await expect(deleteButton).toBeVisible();

    await deleteButton.click();

    // Confirmation modal should appear with report option
    await expect(page.getByText('Delete comment?')).toBeVisible();
    await expect(page.getByText('Also report this comment')).toBeVisible();

    // Confirm deletion without reporting
    await page.locator('.modal').getByRole('button', { name: 'Delete' }).click();

    // Comment should disappear
    await expect(page.getByText('Comment from other user')).not.toBeVisible({ timeout: 5000 });
  });

  test('post owner can delete and report comment', async ({ page }) => {
    // Pre-create a comment by OTHER user
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: otherUserId,
      content: 'Spam comment to report',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Comment should be visible
    await expect(page.getByText('Spam comment to report')).toBeVisible({ timeout: 5000 });

    // Click delete
    await page.getByRole('button', { name: 'Delete' }).click();

    // Check the "Also report" checkbox
    await page.getByText('Also report this comment').click();

    // Select a reason
    await page.locator('.modal select').selectOption('Spam');

    // Confirm deletion
    await page.locator('.modal').getByRole('button', { name: 'Delete' }).click();

    // Comment should disappear
    await expect(page.getByText('Spam comment to report')).not.toBeVisible({ timeout: 5000 });

    // Verify report was created
    const { data: reports } = await supabaseAdmin
      .from('comment_reports')
      .select('*')
      .eq('reporter_id', testUserId)
      .eq('reason', 'Spam');

    expect(reports).toHaveLength(1);
  });

  test('report checkbox not shown when deleting own comment', async ({ page }) => {
    // Pre-create a comment by TEST user (post owner's own comment)
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: testUserId,
      content: 'My own comment',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Comment should be visible
    await expect(page.getByText('My own comment')).toBeVisible({ timeout: 5000 });

    // Click delete
    await page.getByRole('button', { name: 'Delete' }).click();

    // Confirmation modal should appear but WITHOUT report option
    await expect(page.getByText('Delete comment?')).toBeVisible();
    await expect(page.getByText('Also report this comment')).not.toBeVisible();
  });
});

test.describe('Comments - reporting', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    // Clean up comment reports
    await supabaseAdmin.from('comment_reports').delete().not('id', 'is', null);

    // Create a post by OTHER user
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post For Report Test',
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

  test('can report other users comment', async ({ page }) => {
    // Pre-create a comment by OTHER user
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: otherUserId,
      content: 'Comment to report',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Comment should be visible
    await expect(page.getByText('Comment to report')).toBeVisible({ timeout: 5000 });

    // Report button should be visible (use comment-report class to distinguish from post report)
    const reportButton = page.locator('.comment-report');
    await expect(reportButton).toBeVisible();

    await reportButton.click();

    // Report modal should appear
    await expect(page.getByText('Report comment')).toBeVisible();
    await expect(page.getByText('Reports are confidential')).toBeVisible();

    // Select a reason
    await page.locator('.modal select').selectOption('Harassment');

    // Submit report
    await page.getByRole('button', { name: 'Submit report' }).click();

    // Modal should close
    await expect(page.getByText('Report comment')).not.toBeVisible({ timeout: 5000 });

    // Report button should now show "Reported"
    await expect(page.locator('.comment-report')).toHaveText('Reported');
    await expect(page.locator('.comment-report')).toBeDisabled();

    // Verify report was created
    const { data: reports } = await supabaseAdmin
      .from('comment_reports')
      .select('*')
      .eq('reporter_id', testUserId)
      .eq('reason', 'Harassment');

    expect(reports).toHaveLength(1);
  });

  test('cannot report own comment', async ({ page }) => {
    // Pre-create a comment by TEST user
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: testUserId,
      content: 'My own comment',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Comment should be visible
    await expect(page.getByText('My own comment')).toBeVisible({ timeout: 5000 });

    // Report button should NOT be visible for own comment (only delete button)
    await expect(page.locator('.comment-report')).not.toBeVisible();
  });

  test('already reported comment shows Reported button', async ({ page }) => {
    // Pre-create a comment by OTHER user
    const { data: comment } = await supabaseAdmin
      .from('comments')
      .insert({
        post_id: testPostId,
        author_id: otherUserId,
        content: 'Already reported comment',
      })
      .select('id')
      .single();

    // Pre-create a report
    await supabaseAdmin.from('comment_reports').insert({
      reporter_id: testUserId,
      comment_id: comment!.id,
      reason: 'Spam',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Comment should be visible
    await expect(page.getByText('Already reported comment')).toBeVisible({ timeout: 5000 });

    // Report button should show "Reported" and be disabled
    await expect(page.locator('.comment-report')).toHaveText('Reported');
    await expect(page.locator('.comment-report')).toBeDisabled();
  });
});

test.describe('Comments - unauthenticated', () => {
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

  test('shows login prompt instead of comment form', async ({ page }) => {
    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Comment form should not be visible
    await expect(page.locator('textarea[placeholder="Add a comment..."]')).not.toBeVisible();

    // Login prompt should be visible
    await expect(page.getByText('Log in')).toBeVisible();
    await expect(page.getByText('to leave a comment')).toBeVisible();
  });

  test('can still view existing comments', async ({ page }) => {
    // Pre-create a comment
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: otherUserId,
      content: 'Existing comment',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Comment should be visible
    await expect(page.getByText('Existing comment')).toBeVisible({ timeout: 5000 });
  });
});
