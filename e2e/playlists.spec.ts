import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+playlists@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_playlist_user';

const TEST_USER2_EMAIL = 'e2e+playlists2@example.com';
const TEST_USER2_PASSWORD = 'password123';
const TEST_USERNAME2 = 'e2e_playlist_user2';

async function createTestPost(params: {
  userId: string;
  username: string;
  title: string;
  expression: string;
}) {
  const { data, error } = await supabaseAdmin
    .from('posts')
    .insert({
      profile_id: params.userId,
      title: params.title,
      expression: params.expression,
      mode: 'uint8',
      sample_rate: 8000,
      is_draft: false,
    })
    .select('id')
    .single();

  expect(error).toBeNull();
  return data!.id as string;
}

async function createTestPlaylist(params: {
  userId: string;
  title: string;
  description?: string;
  visibility?: 'public' | 'unlisted' | 'private';
}) {
  const { data, error } = await supabaseAdmin
    .from('playlists')
    .insert({
      owner_id: params.userId,
      title: params.title,
      description: params.description || null,
      visibility: params.visibility || 'public',
    })
    .select('id')
    .single();

  expect(error).toBeNull();
  return data!.id as string;
}

async function addPostToPlaylist(playlistId: string, postId: string, position: number) {
  const { error } = await supabaseAdmin.from('playlist_entries').insert({
    playlist_id: playlistId,
    post_id: postId,
    position,
  });

  expect(error).toBeNull();
}

async function clearPlaylistsAndEntries() {
  await supabaseAdmin.from('playlist_entries').delete().not('playlist_id', 'is', null);
  await supabaseAdmin.from('playlists').delete().not('id', 'is', null);
}

test.beforeAll(async () => {
  await ensureTestUser({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  await ensureTestUser({ email: TEST_USER2_EMAIL, password: TEST_USER2_PASSWORD });
});

test.beforeEach(async () => {
  await clearProfilesTable();
  await clearPlaylistsAndEntries();
});

test.describe('Playlists - unauthenticated', () => {
  test.beforeEach(async ({ page }) => {
    await clearSupabaseSession(page);
  });

  test('should display error message when accessing /playlists/new', async ({ page }) => {
    await page.goto('/playlists/new');
    await expect(page.getByText('Log in to create a playlist.')).toBeVisible();
  });

  test('should show login prompt on /playlists/new', async ({ page }) => {
    await page.goto('/playlists/new');
    const loginLink = page.getByRole('link', { name: /log in/i });
    await expect(loginLink).toBeVisible();
  });

  test('should view public playlist without authentication', async ({ page }) => {
    const { userId } = await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    const postId = await createTestPost({
      userId,
      username: TEST_USERNAME,
      title: 'Test Post',
      expression: 't*5',
    });

    const playlistId = await createTestPlaylist({
      userId,
      title: 'Public Test Playlist',
      description: 'A public playlist',
      visibility: 'public',
    });

    await addPostToPlaylist(playlistId, postId, 1);

    await page.goto(`/playlists/${playlistId}`);
    await expect(page.getByRole('heading', { name: 'Public Test Playlist' })).toBeVisible();
    await expect(page.getByText('A public playlist')).toBeVisible();
    await expect(page.getByText('Test Post')).toBeVisible();
  });

  test('should not show Edit button for public playlist when unauthenticated', async ({ page }) => {
    const { userId } = await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);

    const playlistId = await createTestPlaylist({
      userId,
      title: 'Public Playlist',
      visibility: 'public',
    });

    await page.goto(`/playlists/${playlistId}`);
    await expect(page.getByRole('link', { name: /edit/i })).not.toBeVisible();
  });
});

test.describe('Playlists - create', () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    const profile = await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    userId = profile.userId;
    await signInAndInjectSession(page, { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  });

  test('should create a new public playlist', async ({ page }) => {
    await page.goto('/playlists/new');

    await expect(page.getByRole('heading', { name: /create a new playlist/i })).toBeVisible();

    await page.fill('input#title', 'My Test Playlist');
    await page.fill('textarea#description', 'This is a test playlist description');
    await page.selectOption('select#visibility', 'public');

    await page.click('button[type="submit"]');

    await page.waitForURL(/\/playlists\/[a-f0-9-]+$/);
    await expect(page.getByRole('heading', { name: 'My Test Playlist' })).toBeVisible();
    await expect(page.getByText('This is a test playlist description')).toBeVisible();
  });

  test('should create a private playlist', async ({ page }) => {
    await page.goto('/playlists/new');

    await page.fill('input#title', 'Private Playlist');
    await page.selectOption('select#visibility', 'private');

    await page.click('button[type="submit"]');

    await page.waitForURL(/\/playlists\/[a-f0-9-]+$/);
    await expect(page.getByText('private', { exact: true })).toBeVisible();
  });

  test('should show character count for title', async ({ page }) => {
    await page.goto('/playlists/new');

    const titleInput = page.locator('input#title');
    await titleInput.fill('Test');

    await expect(page.getByText('4/64')).toBeVisible();
  });

  test('should validate required title field', async ({ page }) => {
    await page.goto('/playlists/new');

    await page.click('button[type="submit"]');

    // HTML5 validation should prevent submission
    const titleInput = page.locator('input#title');
    await expect(titleInput).toHaveAttribute('required', '');
  });

  test('should allow canceling playlist creation', async ({ page }) => {
    await page.goto('/playlists/new');

    await page.fill('input#title', 'Test Playlist');

    await page.click('button:has-text("Cancel")');

    // Should navigate back
    await expect(page).not.toHaveURL(/\/playlists\/new/);
  });

  test('should create playlist with post from sourcePostId query param', async ({ page }) => {
    const postId = await createTestPost({
      userId,
      username: TEST_USERNAME,
      title: 'Source Post',
      expression: 't*3',
    });

    await page.goto(`/playlists/new?sourcePostId=${postId}`);

    await page.fill('input#title', 'Playlist with Source Post');
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/playlists\/[a-f0-9-]+$/);
    await expect(page.getByText('Source Post', { exact: true })).toBeVisible();
  });
});

test.describe('Playlists - view and play', () => {
  let userId: string;
  let playlistId: string;
  let postId1: string;
  let postId2: string;

  test.beforeEach(async ({ page }) => {
    const profile = await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    userId = profile.userId;

    postId1 = await createTestPost({
      userId,
      username: TEST_USERNAME,
      title: 'First Post',
      expression: 't*5',
    });

    postId2 = await createTestPost({
      userId,
      username: TEST_USERNAME,
      title: 'Second Post',
      expression: 't*7',
    });

    playlistId = await createTestPlaylist({
      userId,
      title: 'Test Playlist',
      description: 'A test playlist with multiple posts',
      visibility: 'public',
    });

    await addPostToPlaylist(playlistId, postId1, 1);
    await addPostToPlaylist(playlistId, postId2, 2);

    await signInAndInjectSession(page, { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  });

  test('should display playlist with all posts', async ({ page }) => {
    await page.goto(`/playlists/${playlistId}`);

    await expect(page.getByRole('heading', { name: 'Test Playlist' })).toBeVisible();
    await expect(page.getByText('A test playlist with multiple posts')).toBeVisible();
    await expect(page.getByText('First Post')).toBeVisible();
    await expect(page.getByText('Second Post')).toBeVisible();
  });

  test('should show Edit button for own playlist', async ({ page }) => {
    await page.goto(`/playlists/${playlistId}`);

    await expect(
      page.locator('.profile-title-row').getByRole('link', { name: 'Edit' }),
    ).toBeVisible();
  });

  test('should not show Edit button for other users playlist', async ({ page }) => {
    const { userId: user2Id } = await ensureTestUserProfile(TEST_USER2_EMAIL, TEST_USERNAME2);

    const otherPlaylistId = await createTestPlaylist({
      userId: user2Id,
      title: 'Other User Playlist',
      visibility: 'public',
    });

    await page.goto(`/playlists/${otherPlaylistId}`);

    await expect(page.getByRole('link', { name: /edit/i })).not.toBeVisible();
  });

  test('should display playlist visibility chip', async ({ page }) => {
    await page.goto(`/playlists/${playlistId}`);

    await expect(page.locator('.chip:has-text("public")')).toBeVisible();
  });

  test('should show playlist owner username', async ({ page }) => {
    await page.goto(`/playlists/${playlistId}`);

    await expect(page.locator('.playlist-header').getByText(`@${TEST_USERNAME}`)).toBeVisible();
  });
});

test.describe('Playlists - edit', () => {
  let userId: string;
  let playlistId: string;
  let postId1: string;
  let postId2: string;
  let postId3: string;

  test.beforeEach(async ({ page }) => {
    const profile = await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    userId = profile.userId;

    postId1 = await createTestPost({
      userId,
      username: TEST_USERNAME,
      title: 'Post One',
      expression: 't*5',
    });

    postId2 = await createTestPost({
      userId,
      username: TEST_USERNAME,
      title: 'Post Two',
      expression: 't*7',
    });

    postId3 = await createTestPost({
      userId,
      username: TEST_USERNAME,
      title: 'Post Three',
      expression: 't*9',
    });

    playlistId = await createTestPlaylist({
      userId,
      title: 'Editable Playlist',
      description: 'Original description',
      visibility: 'public',
    });

    await addPostToPlaylist(playlistId, postId1, 1);
    await addPostToPlaylist(playlistId, postId2, 2);
    await addPostToPlaylist(playlistId, postId3, 3);

    await signInAndInjectSession(page, { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  });

  test('should edit playlist title and description', async ({ page }) => {
    await page.goto(`/playlists/${playlistId}/edit`);

    await expect(page.getByRole('heading', { name: /edit playlist/i })).toBeVisible();

    const titleInput = page.locator('input[type="text"]').first();
    await titleInput.fill('Updated Playlist Title');

    const descriptionTextarea = page.locator('textarea').first();
    await descriptionTextarea.fill('Updated description');

    await page.click('button:has-text("Save changes")');

    await page.waitForURL(`/playlists/${playlistId}`);
    await expect(page.getByRole('heading', { name: 'Updated Playlist Title' })).toBeVisible();
    await expect(page.getByText('Updated description')).toBeVisible();
  });

  test('should display all playlist entries in edit mode', async ({ page }) => {
    await page.goto(`/playlists/${playlistId}/edit`);

    await expect(page.getByText('Post One')).toBeVisible();
    await expect(page.getByText('Post Two')).toBeVisible();
    await expect(page.getByText('Post Three')).toBeVisible();
  });

  test('should remove post from playlist', async ({ page }) => {
    await page.goto(`/playlists/${playlistId}/edit`);

    // Find and click the Remove button for "Post Two"
    const postTwoRow = page.locator('li:has-text("Post Two")');
    await postTwoRow.locator('button:has-text("Remove")').click();

    // Post should still be visible until saved (just marked for removal)
    await expect(page.getByText('Post Two')).not.toBeVisible();

    await page.click('button:has-text("Save changes")');

    await page.waitForURL(`/playlists/${playlistId}`);
    await expect(page.getByText('Post One')).toBeVisible();
    await expect(page.getByText('Post Two')).not.toBeVisible();
    await expect(page.getByText('Post Three')).toBeVisible();
  });

  test('should cancel editing without saving changes', async ({ page }) => {
    await page.goto(`/playlists/${playlistId}/edit`);

    const titleInput = page.locator('input[type="text"]').first();
    await titleInput.fill('This Should Not Save');

    await page.click('button:has-text("Cancel")');

    await page.waitForURL(`/playlists/${playlistId}`);
    await expect(page.getByRole('heading', { name: 'Editable Playlist' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This Should Not Save' })).not.toBeVisible();
  });

  test('should show drag handles for reordering', async ({ page }) => {
    await page.goto(`/playlists/${playlistId}/edit`);

    const dragHandles = page.locator('span[aria-label="Drag handle"]');
    await expect(dragHandles).toHaveCount(3);
  });

  test('should prevent non-owner from accessing edit page', async ({ page }) => {
    await ensureTestUserProfile(TEST_USER2_EMAIL, TEST_USERNAME2);

    await clearSupabaseSession(page);
    await signInAndInjectSession(page, {
      email: TEST_USER2_EMAIL,
      password: TEST_USER2_PASSWORD,
    });

    await page.goto(`/playlists/${playlistId}/edit`);

    await expect(page.getByText(/you don't have permission to edit this playlist/i)).toBeVisible();
  });

  test('should disable save button when title is empty', async ({ page }) => {
    await page.goto(`/playlists/${playlistId}/edit`);

    const titleInput = page.locator('input[type="text"]').first();
    await titleInput.fill('');

    const saveButton = page.locator('button:has-text("Save changes")');
    await expect(saveButton).toBeDisabled();
  });
});

test.describe('Playlists - add to playlist from post detail', () => {
  let userId: string;
  let postId: string;
  let playlistId: string;

  test.beforeEach(async ({ page }) => {
    const profile = await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    userId = profile.userId;

    postId = await createTestPost({
      userId,
      username: TEST_USERNAME,
      title: 'Test Post for Playlist',
      expression: 't*5',
    });

    playlistId = await createTestPlaylist({
      userId,
      title: 'Target Playlist',
      visibility: 'public',
    });

    await signInAndInjectSession(page, { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  });

  test('should add post to playlist from post detail page', async ({ page }) => {
    await page.goto(`/post/${postId}`);

    // Click the "Add to playlist" button
    await page.click('button:has-text("Add to playlist")');

    // Modal should appear
    await expect(page.getByRole('heading', { name: 'Add to playlist' })).toBeVisible();
    await expect(page.getByText('Target Playlist')).toBeVisible();

    // Click Add button for the playlist
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Wait for success
    await expect(page.getByText('Playlists (1)')).toBeVisible();

    // Navigate to playlist and verify post is there
    await page.goto(`/playlists/${playlistId}`);
    await expect(page.getByText('Test Post for Playlist')).toBeVisible();
  });

  test('should show "Already in playlist" when post is already added', async ({ page }) => {
    await addPostToPlaylist(playlistId, postId, 1);

    await page.goto(`/post/${postId}`);
    await page.click('button:has-text("Add to playlist")');

    await expect(page.getByText('Target Playlist')).toBeVisible();
    const addButton = page.locator('li:has-text("Target Playlist")').locator('button');
    await expect(addButton).toBeDisabled();
    await expect(addButton).toHaveText('Added');
  });
});

test.describe('Playlists - visibility', () => {
  let userId: string;
  let publicPlaylistId: string;
  let unlistedPlaylistId: string;
  let privatePlaylistId: string;

  test.beforeEach(async ({ page }) => {
    const profile = await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    userId = profile.userId;

    publicPlaylistId = await createTestPlaylist({
      userId,
      title: 'Public Playlist',
      visibility: 'public',
    });

    unlistedPlaylistId = await createTestPlaylist({
      userId,
      title: 'Unlisted Playlist',
      visibility: 'unlisted',
    });

    privatePlaylistId = await createTestPlaylist({
      userId,
      title: 'Private Playlist',
      visibility: 'private',
    });

    await signInAndInjectSession(page, { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  });

  test('should access public playlist when authenticated', async ({ page }) => {
    await page.goto(`/playlists/${publicPlaylistId}`);
    await expect(page.getByRole('heading', { name: 'Public Playlist' })).toBeVisible();
  });

  test('should access unlisted playlist when authenticated', async ({ page }) => {
    await page.goto(`/playlists/${unlistedPlaylistId}`);
    await expect(page.getByRole('heading', { name: 'Unlisted Playlist' })).toBeVisible();
  });

  test('should access private playlist as owner', async ({ page }) => {
    await page.goto(`/playlists/${privatePlaylistId}`);
    await expect(page.getByRole('heading', { name: 'Private Playlist' })).toBeVisible();
  });
});

test.describe('Playlists - explore page', () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    const profile = await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
    userId = profile.userId;

    await createTestPlaylist({
      userId,
      title: 'Explore Playlist 1',
      description: 'First playlist',
      visibility: 'public',
    });

    await createTestPlaylist({
      userId,
      title: 'Explore Playlist 2',
      description: 'Second playlist',
      visibility: 'public',
    });

    await signInAndInjectSession(page, { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  });

  test('should display playlists on explore page', async ({ page }) => {
    await page.goto('/explore');

    // Switch to playlists tab
    await page.selectOption('select', 'playlists');

    await expect(page.getByText('Explore Playlist 1')).toBeVisible();
    await expect(page.getByText('Explore Playlist 2')).toBeVisible();
  });
});
