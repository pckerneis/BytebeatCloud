import { test, expect } from '@playwright/test';
import {
  ensureTestUser,
  clearProfilesTable,
  ensureTestUserProfileWithOutdatedTos,
} from './utils/supabaseAdmin';
import { clearSupabaseSession, signInAndInjectSession } from './utils/auth';

const TEST_USER_EMAIL = 'e2e+nav@example.com';
const TEST_USER_PASSWORD = 'password123';

test.beforeAll(async () => {
  await ensureTestUser({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
});

test.beforeEach(async () => {
  await clearProfilesTable();
});

test('navigation for unauthenticated user', async ({ page }) => {
  await clearSupabaseSession(page);
  await page.goto('/');

  const nav = page.getByRole('navigation');

  await expect(nav.getByRole('link', { name: 'Create' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Explore' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Login' })).toBeVisible();

  await expect(nav.getByRole('link', { name: 'Profile' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: /Notifications/ })).toHaveCount(0);
});

test('navigation for authenticated user', async ({ page }) => {
  await signInAndInjectSession(page, {
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });

  await page.goto('/');

  const nav = page.getByRole('navigation');

  await expect(nav.getByRole('link', { name: 'Create' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Explore' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Profile' })).toBeVisible();
  await expect(nav.getByRole('link', { name: /Notifications/ })).toBeVisible();

  await expect(nav.getByRole('link', { name: 'Login' })).toHaveCount(0);
});

test('redirection to onboarding for user without username', async ({ page }) => {
  await signInAndInjectSession(page, {
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });

  await page.goto('/');

  const nav = page.getByRole('navigation');

  await expect(nav.getByRole('link', { name: 'Profile' })).toBeVisible();

  // Wait for the gate check to complete - the Create link will point to /onboarding
  // once the gate determines the user needs onboarding
  const createLink = nav.getByRole('link', { name: 'Create' });
  await expect(createLink).toHaveAttribute('href', '/onboarding', { timeout: 10000 });

  await createLink.click();

  // Wait for navigation to finish
  await page.waitForURL('/onboarding');

  const saveButton = page.getByRole('button', { name: 'Save username' });
  await expect(saveButton).toBeDisabled();

  const usernameField = page.getByPlaceholder('Choose a username');

  // Username too short
  await usernameField.click();
  await usernameField.fill('t');
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.getByText('Username must be at least 3 characters')).toBeVisible();

  // Illegal characters
  await usernameField.click();
  await usernameField.fill('t@"');
  await saveButton.click();
  await expect(
    page.getByText('Only letters, digits, dots and hyphens and underscores are allowed'),
  ).toBeVisible();

  // Username OK but ToS NOK
  await usernameField.click();
  await usernameField.fill('foo_bar-0.1');
  await saveButton.click();
  await expect(page.getByText('You must accept the Terms of Service to continue.')).toBeVisible();

  // Accept ToS
  const tosCheckbox = page.getByLabel('I accept the Terms of Service');
  await tosCheckbox.click();
  await saveButton.click();

  // Wait for redirection
  await page.waitForURL('/');

  // Navigate to profile to check is authenticated
  await expect(nav.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/onboarding', {
    timeout: 10000,
  });
  await nav.getByRole('link', { name: 'Profile' }).click();
  await page.waitForURL('/profile');
  await expect(page.getByRole('heading', { name: '@foo_bar-0.1' })).toBeVisible();
});

test('redirection to TOS update page for user with outdated TOS version', async ({ page }) => {
  // Create profile with outdated TOS version
  await ensureTestUserProfileWithOutdatedTos(TEST_USER_EMAIL, 'tos_update_user');

  await signInAndInjectSession(page, {
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });

  await page.goto('/');

  // User should be redirected to TOS update page
  await page.waitForURL('/tos-update', { timeout: 10000 });

  // Verify the TOS update page content
  await expect(page.getByRole('heading', { name: 'Updated Terms of Service' })).toBeVisible();
  await expect(page.getByText('Our Terms of Service have changed')).toBeVisible();

  // Try to submit without accepting - should show error
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('You must accept the Terms of Service to continue.')).toBeVisible();

  // Accept TOS and submit
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Confirm' }).click();

  // Should redirect to home after accepting
  await page.waitForURL('/');

  // Verify user can now navigate normally
  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'Profile' })).toBeVisible();
});
