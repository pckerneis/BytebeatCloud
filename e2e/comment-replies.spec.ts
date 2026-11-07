import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+replies@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_replies_user';

const OTHER_USER_EMAIL = 'e2e+replies_other@example.com';
const OTHER_USER_PASSWORD = 'password123';
const OTHER_USERNAME = 'e2e_replies_other';

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

test.describe('Comment Replies', () => {
  let testPostId: string;

  test.beforeEach(async ({ page }) => {
    await ensureTestUserProfile(OTHER_USER_EMAIL, OTHER_USERNAME);
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    // Create a post by other user
    const { data } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: otherUserId,
        title: 'Post With Replies',
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

  test('can reply to a comment', async ({ page }) => {
    // Pre-create a comment by other user
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: otherUserId,
      content: 'Original comment',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Original comment should be visible
    await expect(page.getByText('Original comment')).toBeVisible({ timeout: 5000 });

    // Find the comment item and click Reply button
    const commentItem = page.locator('.comment-item').filter({ hasText: 'Original comment' });
    const replyButton = commentItem.getByRole('button', { name: 'Reply' });
    await expect(replyButton).toBeVisible();
    await replyButton.click();

    // Reply indicator should appear above the comment form
    await expect(page.getByText(`Replying to @${OTHER_USERNAME}`)).toBeVisible();

    // Comment textarea should be pre-filled with mention
    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    await expect(textarea).toHaveValue(`@${OTHER_USERNAME} `);

    // Add reply text
    await textarea.fill(`@${OTHER_USERNAME} This is my reply`);
    await page.getByRole('button', { name: 'Post comment' }).click();

    // Reply should appear in the list
    await expect(page.getByText('This is my reply')).toBeVisible({ timeout: 5000 });

    // Reply indicator should clear after posting
    await expect(page.getByText(`Replying to @${OTHER_USERNAME}`)).toHaveCount(1); // Only in the comment display, not in form
  });

  test('reply stores reply_to_comment_id in database', async ({ page }) => {
    // Pre-create a comment by other user
    const { data: originalComment } = await supabaseAdmin
      .from('comments')
      .insert({
        post_id: testPostId,
        author_id: otherUserId,
        content: 'Original comment for DB test',
      })
      .select('id')
      .single();

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click Reply on the original comment
    const commentItem = page
      .locator('.comment-item')
      .filter({ hasText: 'Original comment for DB test' });
    await commentItem.getByRole('button', { name: 'Reply' }).click();

    // Wait for reply indicator to ensure state is set
    await expect(page.getByText(`Replying to @${OTHER_USERNAME}`)).toBeVisible();

    // Add reply - use pressSequentially instead of fill to avoid clearing state
    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    await textarea.pressSequentially(' Reply for DB test');

    await page.getByRole('button', { name: 'Post comment' }).click();

    // Wait for reply to appear
    await expect(page.locator('.comment-item').getByText('Reply for DB test')).toBeVisible({
      timeout: 5000,
    });

    await expect(page.getByText(`Replying to @${OTHER_USERNAME}`)).toBeVisible();
    // Check database for reply_to_comment_id
    const { data: replyComment } = await supabaseAdmin
      .from('comments')
      .select('reply_to_comment_id, content')
      .eq('post_id', testPostId)
      .eq('author_id', testUserId)
      .single();

    expect(replyComment?.content).toContain(`@[${otherUserId}]`);
    expect(replyComment?.reply_to_comment_id).toBe(originalComment!.id);
  });

  test('reply displays "Replying to" indicator', async ({ page }) => {
    // Pre-create original comment and a reply
    const { data: originalComment } = await supabaseAdmin
      .from('comments')
      .insert({
        post_id: testPostId,
        author_id: otherUserId,
        content: 'Original comment',
      })
      .select('id')
      .single();

    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: testUserId,
      content: `@[${otherUserId}] This is a reply`,
      reply_to_comment_id: originalComment!.id,
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Both comments should be visible
    await expect(page.getByText('Original comment')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('This is a reply')).toBeVisible();

    // Reply indicator should be visible
    const replyIndicator = page.locator('.comment-reply-indicator');
    await expect(replyIndicator).toBeVisible();
    await expect(replyIndicator).toContainText(`Replying to @${OTHER_USERNAME}`);
  });

  test('can cancel reply', async ({ page }) => {
    // Pre-create a comment
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: otherUserId,
      content: 'Comment to reply to',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Click Reply
    const commentItem = page.locator('.comment-item').filter({ hasText: 'Comment to reply to' });
    await commentItem.getByRole('button', { name: 'Reply' }).click();

    // Reply indicator should appear
    await expect(page.getByText(`Replying to @${OTHER_USERNAME}`)).toBeVisible();

    // Textarea should have mention
    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    await expect(textarea).toHaveValue(`@${OTHER_USERNAME} `);

    // Click Cancel button
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Reply indicator should disappear
    await expect(page.getByText(`Replying to @${OTHER_USERNAME}`)).not.toBeVisible();

    // Textarea should be cleared
    await expect(textarea).toHaveValue('');
  });

  test('can reply to multiple different comments', async ({ page }) => {
    // Pre-create two comments
    const { data: comment1 } = await supabaseAdmin
      .from('comments')
      .insert({
        post_id: testPostId,
        author_id: otherUserId,
        content: 'First comment',
      })
      .select('id')
      .single();

    const { data: comment2 } = await supabaseAdmin
      .from('comments')
      .insert({
        post_id: testPostId,
        author_id: otherUserId,
        content: 'Second comment',
      })
      .select('id')
      .single();

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Reply to first comment
    const firstCommentItem = page.locator('.comment-item').filter({ hasText: 'First comment' });
    await firstCommentItem.getByRole('button', { name: 'Reply' }).click();

    let textarea = page.locator('textarea[placeholder="Add a comment..."]');
    await textarea.fill(`@${OTHER_USERNAME} Reply to first`);
    await page.getByRole('button', { name: 'Post comment' }).click();

    await expect(page.getByText('Reply to first')).toBeVisible({ timeout: 5000 });

    // Reply to second comment
    const secondCommentItem = page.locator('.comment-item').filter({ hasText: 'Second comment' });
    await secondCommentItem.getByRole('button', { name: 'Reply' }).click();

    textarea = page.locator('textarea[placeholder="Add a comment..."]');
    await textarea.fill(`@${OTHER_USERNAME} Reply to second`);
    await page.getByRole('button', { name: 'Post comment' }).click();

    await expect(page.getByText('Reply to second')).toBeVisible({ timeout: 5000 });

    // Verify both replies have correct reply_to_comment_id
    const { data: replies } = await supabaseAdmin
      .from('comments')
      .select('content, reply_to_comment_id')
      .eq('post_id', testPostId)
      .eq('author_id', testUserId)
      .order('created_at', { ascending: true });

    expect(replies).toHaveLength(2);
    expect(replies![0].reply_to_comment_id).toBe(comment1!.id);
    expect(replies![1].reply_to_comment_id).toBe(comment2!.id);
  });

  test('reply preserves existing text in textarea', async ({ page }) => {
    // Pre-create a comment
    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: otherUserId,
      content: 'Comment to reply to',
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Start typing a comment
    const textarea = page.locator('textarea[placeholder="Add a comment..."]');
    await textarea.fill('I was typing this');

    // Click Reply
    const commentItem = page.locator('.comment-item').filter({ hasText: 'Comment to reply to' });
    await commentItem.getByRole('button', { name: 'Reply' }).click();

    // Textarea should have mention prepended to existing text
    await expect(textarea).toHaveValue(`@${OTHER_USERNAME} I was typing this`);
  });

  test('reply button visible for all comments when logged in', async ({ page }) => {
    // Pre-create comments by different users
    await supabaseAdmin.from('comments').insert([
      {
        post_id: testPostId,
        author_id: otherUserId,
        content: 'Other user comment',
      },
      {
        post_id: testPostId,
        author_id: testUserId,
        content: 'Own comment',
      },
    ]);

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // Both comments should have Reply button
    const otherCommentItem = page
      .locator('.comment-item')
      .filter({ hasText: 'Other user comment' });
    await expect(otherCommentItem.getByRole('button', { name: 'Reply' })).toBeVisible();

    const ownCommentItem = page.locator('.comment-item').filter({ hasText: 'Own comment' });
    await expect(ownCommentItem.getByRole('button', { name: 'Reply' })).toBeVisible();
  });

  test('nested replies show correct reply indicators', async ({ page }) => {
    // Create a chain of replies
    const { data: comment1 } = await supabaseAdmin
      .from('comments')
      .insert({
        post_id: testPostId,
        author_id: otherUserId,
        content: 'Original comment',
      })
      .select('id')
      .single();

    const { data: comment2 } = await supabaseAdmin
      .from('comments')
      .insert({
        post_id: testPostId,
        author_id: testUserId,
        content: 'First reply',
        reply_to_comment_id: comment1!.id,
      })
      .select('id')
      .single();

    await supabaseAdmin.from('comments').insert({
      post_id: testPostId,
      author_id: otherUserId,
      content: 'Reply to reply',
      reply_to_comment_id: comment2!.id,
    });

    await page.goto(`/post/${testPostId}`);

    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 10000 });

    // All comments should be visible
    await expect(page.getByText('Original comment')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('First reply')).toBeVisible();
    await expect(page.getByText('Reply to reply')).toBeVisible();

    // Check reply indicators
    const replyIndicators = page.locator('.comment-reply-indicator');
    await expect(replyIndicators).toHaveCount(2); // Two replies, one original

    // First reply should show "Replying to @e2e_replies_other"
    const firstReplyItem = page.locator('.comment-item').filter({ hasText: 'First reply' });
    await expect(firstReplyItem.locator('.comment-reply-indicator')).toContainText(
      `Replying to @${OTHER_USERNAME}`,
    );

    // Second reply should show "Replying to @e2e_replies_user"
    const secondReplyItem = page.locator('.comment-item').filter({ hasText: 'Reply to reply' });
    await expect(secondReplyItem.locator('.comment-reply-indicator')).toContainText(
      `Replying to @${TEST_USERNAME}`,
    );
  });
});
