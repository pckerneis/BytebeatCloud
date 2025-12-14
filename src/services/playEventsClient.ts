import { supabase } from '../lib/supabaseClient';

export async function recordPlayEvent(postId: string, durationSeconds: number, profileId?: string) {
  if (durationSeconds <= 0) {
    return { error: null };
  }

  return supabase.from('play_events').insert({
    post_id: postId,
    profile_id: profileId ?? null,
    duration_seconds: Math.round(durationSeconds),
  });
}

export interface CreatorAnalyticsRow {
  post_id: string;
  post_title: string;
  total_plays: number;
  total_play_seconds: number;
  unique_listeners: number;
  plays_in_period: number;
  play_seconds_in_period: number;
}

export interface CreatorStats {
  total_posts: number;
  total_plays: number;
  total_play_seconds: number;
  unique_listeners: number;
  plays_in_period: number;
  play_seconds_in_period: number;
  total_favorites: number;
}

export async function getCreatorAnalytics(creatorId: string, periodDays = 30) {
  return supabase.rpc('get_creator_analytics', {
    creator_id: creatorId,
    period_days: periodDays,
  }) as unknown as { data: CreatorAnalyticsRow[] | null; error: Error | null };
}

export async function getCreatorStats(creatorId: string, periodDays = 30) {
  return supabase.rpc('get_creator_stats', {
    creator_id: creatorId,
    period_days: periodDays,
  }) as unknown as { data: CreatorStats[] | null; error: Error | null };
}
