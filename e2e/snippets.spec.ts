import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfile,
  supabaseAdmin,
} from './utils/supabaseAdmin';
import { signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+snippets@example.com';
const TEST_USER_PASSWORD = 'password123';
const TEST_USERNAME = 'e2e_snippets_user';

let testUserId: string;

test.beforeAll(async () => {
  const user = await ensureTestUser({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  testUserId = user.id;
});

test.beforeEach(async () => {
  await clearProfilesTable();
  await supabaseAdmin.from('snippets').delete().not('id', 'is', null);
});

test.describe('Snippets - profile page', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('snippets tab is visible on own profile', async ({ page }) => {
    await page.goto('/profile');

    const snippetsTab = page.locator('.tab-button', { hasText: 'Snippets' });
    await expect(snippetsTab).toBeVisible();
  });

  test('snippets tab shows empty state', async ({ page }) => {
    await page.goto('/profile');

    const snippetsTab = page.locator('.tab-button', { hasText: 'Snippets' });
    await snippetsTab.click();

    await expect(page.getByText('You have no snippets yet.')).toBeVisible();
  });

  test('can create a snippet via modal', async ({ page }) => {
    await page.goto('/profile');

    const snippetsTab = page.locator('.tab-button', { hasText: 'Snippets' });
    await snippetsTab.click();

    // Open create modal
    await page.getByRole('button', { name: '+ New snippet' }).click();
    await expect(page.getByRole('heading', { name: 'New snippet' })).toBeVisible();

    // Fill in name
    await page.getByPlaceholder('Snippet name').fill('testsq');

    // Type into CodeMirror snippet editor
    const snippetEditor = page.locator('.snippet-code-editor .cm-content');
    await snippetEditor.click();
    await page.keyboard.type('sq=(S)=>S&128');

    // Fill in description
    await page.getByPlaceholder('Description (optional)').fill('Test square wave');

    // Submit
    await page.getByRole('button', { name: 'Create' }).click();

    // Modal should close and snippet should appear in the list
    await expect(page.getByRole('heading', { name: 'New snippet' })).not.toBeVisible();
    await expect(page.getByText('testsq')).toBeVisible();
    await expect(page.getByText('sq=(S)=>S&128')).toBeVisible();
    await expect(page.getByText('Test square wave')).toBeVisible();
  });

  test('create button is disabled without name or code', async ({ page }) => {
    await page.goto('/profile');

    const snippetsTab = page.locator('.tab-button', { hasText: 'Snippets' });
    await snippetsTab.click();

    await page.getByRole('button', { name: '+ New snippet' }).click();

    const createButton = page.locator('.modal').getByRole('button', { name: 'Create' });
    await expect(createButton).toBeDisabled();

    // Fill only name — still disabled
    await page.getByPlaceholder('Snippet name').fill('test');
    await expect(createButton).toBeDisabled();
  });

  test('can delete a snippet', async ({ page }) => {
    // Seed a snippet directly
    await supabaseAdmin.from('snippets').insert({
      name: 'todelete',
      snippet: 'del=(x)=>x',
      description: 'Will be deleted',
      is_public: false,
      profile_id: testUserId,
    });

    await page.goto('/profile');

    const snippetsTab = page.locator('.tab-button', { hasText: 'Snippets' });
    await snippetsTab.click();

    await expect(page.getByText('todelete')).toBeVisible();

    // Click delete
    await page.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText('todelete')).not.toBeVisible({ timeout: 5000 });
  });

  test('snippet shows public/private badge', async ({ page }) => {
    await supabaseAdmin.from('snippets').insert([
      {
        name: 'pub_snippet',
        snippet: 'pub=(x)=>x',
        description: '',
        is_public: true,
        profile_id: testUserId,
      },
      {
        name: 'priv_snippet',
        snippet: 'priv=(x)=>x',
        description: '',
        is_public: false,
        profile_id: testUserId,
      },
    ]);

    await page.goto('/profile');

    const snippetsTab = page.locator('.tab-button', { hasText: 'Snippets' });
    await snippetsTab.click();

    await expect(page.getByText('pub_snippet')).toBeVisible();
    await expect(page.getByText('priv_snippet')).toBeVisible();
    await expect(page.getByText('public')).toBeVisible();
    await expect(page.getByText('private')).toBeVisible();
  });
});

test.describe('Snippets - insert in editor', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndInjectSession(page, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    await ensureTestUserProfile(TEST_USER_EMAIL, TEST_USERNAME);
  });

  test('insert snippet modal opens and shows search', async ({ page }) => {
    await page.goto('/create');

    await page.getByRole('button', { name: '+ Insert snippet' }).click();

    await expect(page.getByRole('heading', { name: 'Insert snippet' })).toBeVisible();
    await expect(page.getByPlaceholder('Search for a snippet...')).toBeVisible();
  });

  test('insert snippet modal shows seeded snippet and inserts on click', async ({ page }) => {
    // Seed a public snippet
    await supabaseAdmin.from('snippets').insert({
      name: 'e2e_sq',
      snippet: 'sq=(S)=>S&128',
      description: 'E2E square wave',
      is_public: true,
      profile_id: testUserId,
    });

    await page.goto('/create');

    // Type an expression first
    const editor = page.locator('.expression-input .cm-content');
    await editor.click();
    await page.keyboard.type('t>>4');

    // Open snippet modal
    await page.getByRole('button', { name: '+ Insert snippet' }).click();
    await expect(page.getByRole('heading', { name: 'Insert snippet' })).toBeVisible();

    // Snippet should appear
    await expect(page.getByText('e2e_sq')).toBeVisible();
    await expect(page.getByText('E2E square wave')).toBeVisible();

    // Click to insert
    await page.getByText('e2e_sq').click();

    // Modal should close
    await expect(page.getByRole('heading', { name: 'Insert snippet' })).not.toBeVisible();

    // Expression should now contain the snippet appended with comma
    await expect(page.locator('.expression-input')).toContainText('sq=(S)=>S&128');
  });

  test('insert snippet modal search filters results', async ({ page }) => {
    await supabaseAdmin.from('snippets').insert([
      {
        name: 'e2e_square',
        snippet: 'sq=(S)=>S&128',
        description: 'Square wave',
        is_public: true,
        profile_id: testUserId,
      },
      {
        name: 'e2e_mtof',
        snippet: 'mtof=(N)=>N',
        description: 'MIDI to freq',
        is_public: true,
        profile_id: testUserId,
      },
    ]);

    await page.goto('/create');

    await page.getByRole('button', { name: '+ Insert snippet' }).click();

    // Both should be visible initially
    await expect(page.getByText('e2e_square')).toBeVisible();
    await expect(page.getByText('e2e_mtof')).toBeVisible();

    // Search for "square"
    await page.getByPlaceholder('Search for a snippet...').fill('square');

    // Wait for debounced search
    await expect(page.getByText('e2e_square')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('e2e_mtof')).not.toBeVisible({ timeout: 5000 });
  });

  test('insert snippet modal can be closed', async ({ page }) => {
    await page.goto('/create');

    await page.getByRole('button', { name: '+ Insert snippet' }).click();
    await expect(page.getByRole('heading', { name: 'Insert snippet' })).toBeVisible();

    await page.locator('.modal').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Insert snippet' })).not.toBeVisible();
  });

  test('inserting snippet into empty expression does not add leading comma', async ({ page }) => {
    await supabaseAdmin.from('snippets').insert({
      name: 'e2e_solo',
      snippet: 'solo=(x)=>x',
      description: '',
      is_public: true,
      profile_id: testUserId,
    });

    await page.goto('/create');

    // Open snippet modal without typing anything first
    await page.getByRole('button', { name: '+ Insert snippet' }).click();

    // Click to insert
    await page.getByText('e2e_solo').click();

    // Expression should contain the snippet without leading comma
    await expect(page.locator('.expression-input')).toContainText('solo=(x)=>x');
  });
});
