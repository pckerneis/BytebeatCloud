import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './utils/supabaseAdmin';

async function clearWeeklyData() {
  // Order matters because of foreign keys
  await supabaseAdmin.from('favorites').delete().not('id', 'is', null);
  await supabaseAdmin.from('post_tags').delete().not('post_id', 'is', null);
  await supabaseAdmin.from('tags').delete().not('id', 'is', null);
  await supabaseAdmin.from('posts').delete().not('id', 'is', null);
  await supabaseAdmin.from('weekly_challenges').delete().not('id', 'is', null);
  await supabaseAdmin.from('theme_ideas').delete().not('idea', 'is', null);
}

test.describe('Weekly challenges - start_new_weekly_challenge', () => {
  test.beforeEach(async () => {
    await clearWeeklyData();
  });

  test('creates a new weekly challenge and consumes a theme idea', async () => {
    // Seed some theme ideas
    const themes = ['Freedom', 'Tiny', 'Chaos Theory'];
    const { error: seedError } = await supabaseAdmin.from('theme_ideas').insert(
      themes.map((idea) => ({ idea })),
    );
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
    const startsAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    const endsAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000); // in 4 days

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
