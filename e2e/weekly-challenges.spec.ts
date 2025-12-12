import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './utils/supabaseAdmin';

async function clearWeeklyData() {
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
  await supabaseAdmin.from('theme_ideas').delete().not('idea', 'is', null);
  await supabaseAdmin.from('profiles').delete().not('id', 'is', null);
}

test.describe('Weekly challenges - start_new_weekly_challenge', () => {
  test.beforeEach(async () => {
    await clearWeeklyData();
  });

  test('creates a new weekly challenge and consumes a theme idea', async () => {
    // Seed some theme ideas
    const themes = ['Freedom', 'Tiny', 'Chaos Theory'];
    const { error: seedError } = await supabaseAdmin
      .from('theme_ideas')
      .insert(themes.map((idea) => ({ idea })));
    expect(seedError).toBeNull();

    // Call the function
    const { error: rpcError } = await supabaseAdmin.rpc('start_new_weekly_challenge');
    expect(rpcError).toBeNull();

    // One weekly_challenges row should exist
    const { data: challenges, error: wcError } = await supabaseAdmin
      .from('weekly_challenges')
      .select('*')
      .order('week_number', { ascending: true });
    expect(wcError).toBeNull();
    expect(challenges).not.toBeNull();
    expect(challenges!.length).toBe(1);

    const challenge = challenges![0];
    expect(challenge.week_number).toBe(1);
    expect(challenge.tag).toBe('week1');
    expect(themes).toContain(challenge.theme);

    // The chosen theme should have been removed from theme_ideas
    const { data: remainingThemes, error: remainingError } = await supabaseAdmin
      .from('theme_ideas')
      .select('idea');
    expect(remainingError).toBeNull();
    expect(remainingThemes).not.toBeNull();
    expect(remainingThemes!.length).toBe(themes.length - 1);
    const remainingIdeas = remainingThemes!.map((t) => t.idea as string);
    expect(remainingIdeas).not.toContain(challenge.theme as string);
  });
});

test.describe('Weekly challenges - finalize_current_week', () => {
  test.beforeEach(async () => {
    await clearWeeklyData();
  });

  test('picks the most-favorited post with the weekly tag and correct tie-breaker', async () => {
    // Create challenge row for this week
    const now = new Date();
    const startsAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    const endsAt = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago (challenge has ended)

    const { data: challengeInsert, error: challengeError } = await supabaseAdmin
      .from('weekly_challenges')
      .insert({
        week_number: 1,
        theme: 'Test Theme',
        tag: 'week1',
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .select('*')
      .single();
    expect(challengeError).toBeNull();
    expect(challengeInsert).not.toBeNull();

    // Create the weekly tag in tags table
    const { data: tagRow, error: tagError } = await supabaseAdmin
      .from('tags')
      .insert({ name: 'week1' })
      .select('*')
      .single();
    expect(tagError).toBeNull();
    expect(tagRow).not.toBeNull();

    // Create a test profile to satisfy posts/favorites foreign keys
    const testProfileId = crypto.randomUUID();
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: testProfileId,
      username: 'weekly_e2e_user',
    });
    expect(profileError).toBeNull();

    // Insert two posts in the time window, both tagged with week1
    const basePost = {
      profile_id: testProfileId,
      expression: 't>>4',
      mode: 'uint8',
      is_draft: false,
      sample_rate: 8000,
    };

    const createdAtA = new Date(startsAt.getTime() + 1 * 60 * 60 * 1000); // +1h
    const createdAtB = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000); // +2h

    const { data: postA, error: postAError } = await supabaseAdmin
      .from('posts')
      .insert({
        ...basePost,
        title: 'Post A',
        created_at: createdAtA.toISOString(),
      })
      .select('*')
      .single();
    expect(postAError).toBeNull();

    const { data: postB, error: postBError } = await supabaseAdmin
      .from('posts')
      .insert({
        ...basePost,
        title: 'Post B',
        created_at: createdAtB.toISOString(),
      })
      .select('*')
      .single();
    expect(postBError).toBeNull();

    // Attach tag week1 to both posts
    const { error: ptError } = await supabaseAdmin.from('post_tags').insert([
      { post_id: postA!.id, tag_id: tagRow!.id },
      { post_id: postB!.id, tag_id: tagRow!.id },
    ]);
    expect(ptError).toBeNull();

    // Favorite counts: same for both (1 each), but last favorite time differs.
    // Reuse the same test profile for favorites to satisfy the FK and keep
    // favorites_profile_post_uidx (profile_id, post_id) unique.
    const baseFavUser = testProfileId;

    const favA = {
      profile_id: baseFavUser,
      post_id: postA!.id,
      // Earlier favorite time
      created_at: new Date(startsAt.getTime() + 20 * 60 * 60 * 1000).toISOString(),
    };

    const favB = {
      profile_id: baseFavUser,
      post_id: postB!.id,
      // Later favorite time
      created_at: new Date(startsAt.getTime() + 30 * 60 * 60 * 1000).toISOString(),
    };

    const favRows = [favA, favB];

    const { error: favError } = await supabaseAdmin.from('favorites').insert(favRows);
    expect(favError).toBeNull();

    // Call finalize function
    const { error: finalizeError } = await supabaseAdmin.rpc('finalize_current_week');
    expect(finalizeError).toBeNull();

    // Reload challenge and verify winner_post_id
    const { data: finalizedChallenge, error: reloadError } = await supabaseAdmin
      .from('weekly_challenges')
      .select('winner_post_id')
      .eq('id', challengeInsert!.id)
      .single();
    expect(reloadError).toBeNull();
    expect(finalizedChallenge).not.toBeNull();
    expect(finalizedChallenge!.winner_post_id).toBe(postA!.id);
  });
});

test.describe('Weekly challenges - cascade behavior', () => {
  test.beforeEach(async () => {
    await clearWeeklyData();
  });

  test('winner_post_id is set to NULL when the winning post is deleted', async () => {
    const now = new Date();
    const startsAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // Create a profile
    const profileId = crypto.randomUUID();
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: profileId,
      username: 'cascade_test_user',
    });
    expect(profileError).toBeNull();

    // Create a winner post
    const { data: winnerPost, error: postError } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: profileId,
        title: 'Winner Post',
        expression: 't>>3',
        mode: 'uint8',
        is_draft: false,
        sample_rate: 8000,
      })
      .select('*')
      .single();
    expect(postError).toBeNull();
    expect(winnerPost).not.toBeNull();

    // Create a completed challenge with the winner
    const { data: challenge, error: challengeError } = await supabaseAdmin
      .from('weekly_challenges')
      .insert({
        week_number: 1,
        theme: 'Cascade Test',
        tag: 'week1',
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        winner_post_id: winnerPost!.id,
      })
      .select('*')
      .single();
    expect(challengeError).toBeNull();

    // Delete the winning post
    const { error: deleteError } = await supabaseAdmin
      .from('posts')
      .delete()
      .eq('id', winnerPost!.id);
    expect(deleteError).toBeNull();

    // Verify winner_post_id is now NULL
    const { data: updatedChallenge, error: reloadError } = await supabaseAdmin
      .from('weekly_challenges')
      .select('winner_post_id')
      .eq('id', challenge!.id)
      .single();
    expect(reloadError).toBeNull();
    expect(updatedChallenge).not.toBeNull();
    expect(updatedChallenge!.winner_post_id).toBeNull();
  });

  test('winner_post_id is set to NULL when the winner profile is deleted (cascades through post)', async () => {
    const now = new Date();
    const startsAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // Create a profile
    const profileId = crypto.randomUUID();
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: profileId,
      username: 'profile_cascade_user',
    });
    expect(profileError).toBeNull();

    // Create a winner post
    const { data: winnerPost, error: postError } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: profileId,
        title: 'Winner Post Profile Cascade',
        expression: 't>>5',
        mode: 'uint8',
        is_draft: false,
        sample_rate: 8000,
      })
      .select('*')
      .single();
    expect(postError).toBeNull();
    expect(winnerPost).not.toBeNull();

    // Create a completed challenge with the winner
    const { data: challenge, error: challengeError } = await supabaseAdmin
      .from('weekly_challenges')
      .insert({
        week_number: 1,
        theme: 'Profile Cascade Test',
        tag: 'week1',
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        winner_post_id: winnerPost!.id,
      })
      .select('*')
      .single();
    expect(challengeError).toBeNull();

    // Delete the profile (should cascade to post, then set winner_post_id to NULL)
    const { error: deleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', profileId);
    expect(deleteError).toBeNull();

    // Verify winner_post_id is now NULL
    const { data: updatedChallenge, error: reloadError } = await supabaseAdmin
      .from('weekly_challenges')
      .select('winner_post_id')
      .eq('id', challenge!.id)
      .single();
    expect(reloadError).toBeNull();
    expect(updatedChallenge).not.toBeNull();
    expect(updatedChallenge!.winner_post_id).toBeNull();
  });

  test('hall of fame excludes challenges with deleted winner posts', async () => {
    const now = new Date();

    // Week 1: winner post will be deleted
    const week1Start = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    const week1End = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Week 2: winner post remains
    const week2Start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const week2End = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Create profiles
    const profile1Id = crypto.randomUUID();
    const profile2Id = crypto.randomUUID();
    await supabaseAdmin.from('profiles').insert([
      { id: profile1Id, username: 'hof_user_1' },
      { id: profile2Id, username: 'hof_user_2' },
    ]);

    // Create winner posts
    const { data: post1 } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: profile1Id,
        title: 'Week 1 Winner (will be deleted)',
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
        title: 'Week 2 Winner (remains)',
        expression: 't>>2',
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
        theme: 'Week 1 Theme',
        tag: 'week1',
        starts_at: week1Start.toISOString(),
        ends_at: week1End.toISOString(),
        winner_post_id: post1!.id,
      },
      {
        week_number: 2,
        theme: 'Week 2 Theme',
        tag: 'week2',
        starts_at: week2Start.toISOString(),
        ends_at: week2End.toISOString(),
        winner_post_id: post2!.id,
      },
    ]);

    // Verify both appear in hall of fame initially
    const { data: hofBefore } = await supabaseAdmin
      .from('weekly_hall_of_fame')
      .select('week_number');
    expect(hofBefore).toHaveLength(2);

    // Delete week 1's winner post
    await supabaseAdmin.from('posts').delete().eq('id', post1!.id);

    // Verify only week 2 appears in hall of fame now
    const { data: hofAfter } = await supabaseAdmin
      .from('weekly_hall_of_fame')
      .select('week_number, title');
    expect(hofAfter).toHaveLength(1);
    expect(hofAfter![0].week_number).toBe(2);
    expect(hofAfter![0].title).toBe('Week 2 Winner (remains)');
  });
});

test.describe('Weekly challenges - UI handles deleted winners', () => {
  test.beforeEach(async () => {
    await clearWeeklyData();
  });

  test('home page handles missing winner post gracefully', async ({ page }) => {
    const now = new Date();

    // Previous week with winner that will be deleted
    const prevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const prevEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Current week
    const currentStart = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const currentEnd = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

    // Create profile and winner post
    const profileId = crypto.randomUUID();
    await supabaseAdmin.from('profiles').insert({
      id: profileId,
      username: 'deleted_winner_user',
    });

    const { data: winnerPost } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: profileId,
        title: 'Soon Deleted Winner',
        expression: 't>>4',
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
        theme: 'Previous Theme',
        tag: 'week1',
        starts_at: prevStart.toISOString(),
        ends_at: prevEnd.toISOString(),
        winner_post_id: winnerPost!.id,
      },
      {
        week_number: 2,
        theme: 'Current Theme',
        tag: 'week2',
        starts_at: currentStart.toISOString(),
        ends_at: currentEnd.toISOString(),
      },
    ]);

    // Delete the winner post
    await supabaseAdmin.from('posts').delete().eq('id', winnerPost!.id);

    // Visit home page - should not crash, should show current theme
    await page.goto('/');

    const section = page.locator('fieldset', { hasText: 'Bytebeat of the Week' });
    await expect(section).toBeVisible();

    // Current week info should still be shown
    await expect(section.getByText('Week #2', { exact: false })).toBeVisible();
    await expect(section.getByText('Current Theme', { exact: false })).toBeVisible();

    // No crash, no unhandled error visible
    await expect(page.locator('.error-message')).not.toBeVisible();
  });

  test('hall of fame page shows empty state when all winners are deleted', async ({ page }) => {
    const now = new Date();
    const prevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const prevEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Create profile and winner post
    const profileId = crypto.randomUUID();
    await supabaseAdmin.from('profiles').insert({
      id: profileId,
      username: 'all_deleted_user',
    });

    const { data: winnerPost } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: profileId,
        title: 'Only Winner',
        expression: 't>>6',
        mode: 'uint8',
        is_draft: false,
        sample_rate: 8000,
      })
      .select('*')
      .single();

    await supabaseAdmin.from('weekly_challenges').insert({
      week_number: 1,
      theme: 'Only Theme',
      tag: 'week1',
      starts_at: prevStart.toISOString(),
      ends_at: prevEnd.toISOString(),
      winner_post_id: winnerPost!.id,
    });

    // Delete the winner post
    await supabaseAdmin.from('posts').delete().eq('id', winnerPost!.id);

    // Visit hall of fame page
    await page.goto('/weekly-hall-of-fame');

    // Should show empty state message
    await expect(page.getByText('No past weekly winners yet.')).toBeVisible();
  });

  test('hall of fame page shows remaining winners after some are deleted', async ({ page }) => {
    const now = new Date();

    const week1Start = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    const week1End = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const week2Start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const week2End = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Create profiles
    const profile1Id = crypto.randomUUID();
    const profile2Id = crypto.randomUUID();
    await supabaseAdmin.from('profiles').insert([
      { id: profile1Id, username: 'hof_partial_1' },
      { id: profile2Id, username: 'hof_partial_2' },
    ]);

    // Create posts
    const { data: post1 } = await supabaseAdmin
      .from('posts')
      .insert({
        profile_id: profile1Id,
        title: 'Deleted Winner',
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
        title: 'Remaining Winner',
        expression: 't>>2',
        mode: 'uint8',
        is_draft: false,
        sample_rate: 8000,
      })
      .select('*')
      .single();

    await supabaseAdmin.from('weekly_challenges').insert([
      {
        week_number: 1,
        theme: 'Deleted Theme',
        tag: 'week1',
        starts_at: week1Start.toISOString(),
        ends_at: week1End.toISOString(),
        winner_post_id: post1!.id,
      },
      {
        week_number: 2,
        theme: 'Remaining Theme',
        tag: 'week2',
        starts_at: week2Start.toISOString(),
        ends_at: week2End.toISOString(),
        winner_post_id: post2!.id,
      },
    ]);

    // Delete week 1's winner
    await supabaseAdmin.from('posts').delete().eq('id', post1!.id);

    // Visit hall of fame page
    await page.goto('/weekly-hall-of-fame');

    // Should show only week 2's winner
    await expect(page.getByText('Remaining Winner')).toBeVisible();
    await expect(page.getByText('Remaining Theme')).toBeVisible();
    await expect(page.getByText('Week #2', { exact: false })).toBeVisible();

    // Should NOT show deleted winner
    await expect(page.getByText('Deleted Winner')).not.toBeVisible();
    await expect(page.getByText('Deleted Theme')).not.toBeVisible();
  });
});
