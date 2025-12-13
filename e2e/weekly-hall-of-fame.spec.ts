import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './utils/supabaseAdmin';

async function clearHallOfFameData() {
  // Order matters because of foreign keys
  // First nullify winner_post_id to break FK dependency
  await supabaseAdmin
    .from('weekly_challenges')
    .update({ winner_post_id: null })
    .not('id', 'is', null);
  await supabaseAdmin.from('favorites').delete().not('id', 'is', null);
  await supabaseAdmin.from('post_tags').delete().not('post_id', 'is', null);
  await supabaseAdmin.from('tags').delete().not('id', 'is', null);
  await supabaseAdmin.from('posts').delete().not('id', 'is', null);
  await supabaseAdmin.from('weekly_challenges').delete().not('id', 'is', null);
  await supabaseAdmin.from('profiles').delete().not('id', 'is', null);
}

test.describe('Weekly Hall of Fame page', () => {
  test.beforeEach(async () => {
    await clearHallOfFameData();
  });

  test('shows empty state when no winners exist', async ({ page }) => {
    await page.goto('/weekly-hall-of-fame');

    await expect(page.getByText('Weekly Hall of Fame')).toBeVisible();
    await expect(page.getByText('No past weekly winners yet.')).toBeVisible();
  });

  test('shows single winner with correct details', async ({ page }) => {
    const now = new Date();
    const startsAt = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Create profile
    const profileId = crypto.randomUUID();
    await supabaseAdmin.from('profiles').insert({
      id: profileId,
      username: 'hof_single_user',
    });

    // Create winner post
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: profileId,
        title: 'Single Winner Post',
        expression: 't>>3',
        mode: 'uint8',
        is_draft: false,
        sample_rate: 8000,
      })
      .select('*')
      .single();

    // Create challenge with winner
    await supabaseAdmin.from('weekly_challenges').insert({
      week_number: 1,
      theme: 'First Theme',
      tag: 'week1',
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      winner_post_id: post!.id,
    });

    await page.goto('/weekly-hall-of-fame');

    // Verify winner is displayed
    await expect(page.getByText('Single Winner Post')).toBeVisible();
    await expect(page.getByText('@hof_single_user')).toBeVisible();
    await expect(page.getByText('Week #1', { exact: false })).toBeVisible();
    await expect(page.getByText('First Theme', { exact: false })).toBeVisible();

    // Verify link to post
    const postLink = page.locator('a', { hasText: 'Single Winner Post' });
    await expect(postLink).toHaveAttribute('href', `/post/${post!.id}`);

    // Verify expression player is present
    await expect(page.locator('.post-expression')).toBeVisible();
  });

  test('shows multiple winners ordered by week number descending', async ({ page }) => {
    const now = new Date();

    // Week 1 (oldest)
    const week1Start = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const week1End = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);

    // Week 2
    const week2Start = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    const week2End = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Week 3 (newest)
    const week3Start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const week3End = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Create profiles
    const profile1Id = crypto.randomUUID();
    const profile2Id = crypto.randomUUID();
    const profile3Id = crypto.randomUUID();
    await supabaseAdmin.from('profiles').insert([
      { id: profile1Id, username: 'hof_user_week1' },
      { id: profile2Id, username: 'hof_user_week2' },
      { id: profile3Id, username: 'hof_user_week3' },
    ]);

    // Create posts
    const { data: post1 } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: profile1Id,
        title: 'Week 1 Winner',
        expression: 't>>1',
        mode: 'uint8',
        is_draft: false,
        sample_rate: 8000,
      })
      .select('*')
      .single();

    const { data: post2 } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: profile2Id,
        title: 'Week 2 Winner',
        expression: 't>>2',
        mode: 'uint8',
        is_draft: false,
        sample_rate: 8000,
      })
      .select('*')
      .single();

    const { data: post3 } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: profile3Id,
        title: 'Week 3 Winner',
        expression: 't>>3',
        mode: 'uint8',
        is_draft: false,
        sample_rate: 8000,
      })
      .select('*')
      .single();

    // Create challenges
    await supabaseAdmin.from('weekly_challenges').insert([
      {
        week_number: 1,
        theme: 'Theme One',
        tag: 'week1',
        starts_at: week1Start.toISOString(),
        ends_at: week1End.toISOString(),
        winner_post_id: post1!.id,
      },
      {
        week_number: 2,
        theme: 'Theme Two',
        tag: 'week2',
        starts_at: week2Start.toISOString(),
        ends_at: week2End.toISOString(),
        winner_post_id: post2!.id,
      },
      {
        week_number: 3,
        theme: 'Theme Three',
        tag: 'week3',
        starts_at: week3Start.toISOString(),
        ends_at: week3End.toISOString(),
        winner_post_id: post3!.id,
      },
    ]);

    await page.goto('/weekly-hall-of-fame');

    // Verify all winners are displayed
    await expect(page.getByText('Week 1 Winner')).toBeVisible();
    await expect(page.getByText('Week 2 Winner')).toBeVisible();
    await expect(page.getByText('Week 3 Winner')).toBeVisible();

    // Verify ordering: Week 3 should appear first (descending order)
    const listItems = page.locator('.post-item');
    await expect(listItems).toHaveCount(3);

    // First item should be Week 3
    await expect(listItems.nth(0).getByText('Week #3', { exact: false })).toBeVisible();
    await expect(listItems.nth(0).getByText('Week 3 Winner')).toBeVisible();

    // Second item should be Week 2
    await expect(listItems.nth(1).getByText('Week #2', { exact: false })).toBeVisible();
    await expect(listItems.nth(1).getByText('Week 2 Winner')).toBeVisible();

    // Third item should be Week 1
    await expect(listItems.nth(2).getByText('Week #1', { exact: false })).toBeVisible();
    await expect(listItems.nth(2).getByText('Week 1 Winner')).toBeVisible();
  });

  test('does not show challenges without winners', async ({ page }) => {
    const now = new Date();

    // Completed week with winner
    const week1Start = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    const week1End = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Current week without winner yet
    const week2Start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const week2End = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

    // Create profile
    const profileId = crypto.randomUUID();
    await supabaseAdmin.from('profiles').insert({
      id: profileId,
      username: 'hof_mixed_user',
    });

    // Create winner post for week 1
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: profileId,
        title: 'Completed Week Winner',
        expression: 't>>4',
        mode: 'uint8',
        is_draft: false,
        sample_rate: 8000,
      })
      .select('*')
      .single();

    // Create challenges - one with winner, one without
    await supabaseAdmin.from('weekly_challenges').insert([
      {
        week_number: 1,
        theme: 'Completed Theme',
        tag: 'week1',
        starts_at: week1Start.toISOString(),
        ends_at: week1End.toISOString(),
        winner_post_id: post!.id,
      },
      {
        week_number: 2,
        theme: 'Current Theme',
        tag: 'week2',
        starts_at: week2Start.toISOString(),
        ends_at: week2End.toISOString(),
        // No winner_post_id
      },
    ]);

    await page.goto('/weekly-hall-of-fame');

    // Only the completed week with winner should appear
    await expect(page.getByText('Completed Week Winner')).toBeVisible();
    await expect(page.getByText('Completed Theme', { exact: false })).toBeVisible();

    // Current week without winner should NOT appear
    await expect(page.getByText('Current Theme')).not.toBeVisible();

    // Only one item in the list
    const listItems = page.locator('.post-item');
    await expect(listItems).toHaveCount(1);
  });

  test('links to about-weekly page', async ({ page }) => {
    await page.goto('/weekly-hall-of-fame');

    const aboutLink = page.locator('a', { hasText: 'Bytebeat of the Week' });
    await expect(aboutLink).toBeVisible();
    await expect(aboutLink).toHaveAttribute('href', '/about-weekly');
  });

  test('winner post link navigates to post detail page', async ({ page }) => {
    const now = new Date();
    const startsAt = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Create profile
    const profileId = crypto.randomUUID();
    await supabaseAdmin.from('profiles').insert({
      id: profileId,
      username: 'hof_nav_user',
    });

    // Create winner post
    const { data: post } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: profileId,
        title: 'Navigable Winner',
        expression: 't>>5',
        mode: 'uint8',
        is_draft: false,
        sample_rate: 8000,
      })
      .select('*')
      .single();

    // Create challenge
    await supabaseAdmin.from('weekly_challenges').insert({
      week_number: 1,
      theme: 'Navigation Theme',
      tag: 'week1',
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      winner_post_id: post!.id,
    });

    await page.goto('/weekly-hall-of-fame');

    // Click on the winner link
    await page.locator('a', { hasText: 'Navigable Winner' }).click();

    // Should navigate to post detail page
    await expect(page).toHaveURL(`/post/${post!.id}`);
    await expect(page.locator('h1, h2, h3').getByText('Navigable Winner')).toBeVisible();
  });
});
