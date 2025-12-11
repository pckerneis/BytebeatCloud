import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './utils/supabaseAdmin';

async function clearHomeWeeklyData() {
  // Order matters because of foreign keys
  await supabaseAdmin.from('favorites').delete().not('id', 'is', null);
  await supabaseAdmin.from('post_tags').delete().not('post_id', 'is', null);
  await supabaseAdmin.from('tags').delete().not('id', 'is', null);
  await supabaseAdmin.from('posts').delete().not('id', 'is', null);
  await supabaseAdmin.from('weekly_challenges').delete().not('id', 'is', null);
  await supabaseAdmin.from('profiles').delete().not('id', 'is', null);
}

test.describe('Home page - Bytebeat of the Week', () => {
  test.beforeEach(async () => {
    await clearHomeWeeklyData();

    const now = new Date();

    // Previous week (already finished) with a winner
    const prevWeekNumber = 1;
    const prevStartsAt = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 2 weeks ago
    const prevEndsAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 1 week ago

    // Current week (active)
    const currentWeekNumber = 2;
    const currentStartsAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // yesterday
    const currentEndsAt = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000); // in 6 days

    // Create a profile for the winner post
    const profileId = crypto.randomUUID();
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: profileId,
      username: 'weekly_home_user',
    });
    if (profileError) {
      throw new Error(`[e2e] Failed to insert profile: ${profileError.message}`);
    }

    // Create winner post for previous week
    const { data: winnerPost, error: postError } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: profileId,
        title: 'Weekly Winner',
        expression: 't>>2',
        mode: 'uint8',
        is_draft: false,
        sample_rate: 8000,
        created_at: new Date(prevStartsAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      })
      .select('*')
      .single();
    if (postError || !winnerPost) {
      throw new Error(`[e2e] Failed to insert winner post: ${postError?.message}`);
    }

    // Insert previous weekly challenge with winner
    const { error: prevChallengeError } = await supabaseAdmin.from('weekly_challenges').insert({
      week_number: prevWeekNumber,
      theme: 'Previous Theme',
      tag: 'week1',
      starts_at: prevStartsAt.toISOString(),
      ends_at: prevEndsAt.toISOString(),
      winner_post_id: winnerPost.id,
    });
    if (prevChallengeError) {
      throw new Error(`[e2e] Failed to insert previous weekly challenge: ${prevChallengeError.message}`);
    }

    // Insert current weekly challenge (no winner yet)
    const { error: currentChallengeError } = await supabaseAdmin.from('weekly_challenges').insert({
      week_number: currentWeekNumber,
      theme: 'Freedom',
      tag: 'week2',
      starts_at: currentStartsAt.toISOString(),
      ends_at: currentEndsAt.toISOString(),
    });
    if (currentChallengeError) {
      throw new Error(`[e2e] Failed to insert current weekly challenge: ${currentChallengeError.message}`);
    }
  });

  test('shows current week theme and previous winner', async ({ page }) => {
    await page.goto('/');

    // Ensure the Bytebeat of the Week section is visible
    const section = page.locator('fieldset', { hasText: 'Bytebeat of the Week' });
    await expect(section).toBeVisible();

    // Check winner text and link
    await expect(section.getByText('Last Week\'s Top Pick is', { exact: false })).toBeVisible();
    const winnerLink = section.locator('a', { hasText: 'Weekly Winner by @weekly_home_user' });
    await expect(winnerLink).toBeVisible();
    await expect(winnerLink).toHaveAttribute('href', /\/post\//);

    // Check week number and theme line
    await expect(
      section.getByText('Week #2: theme is "Freedom"', { exact: false }),
    ).toBeVisible();

    // Ensure a PostExpressionPlayer is rendered in the section
    await expect(section.locator('.post-expression')).toBeVisible();
  });
});
