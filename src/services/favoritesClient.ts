import { supabase } from '../lib/supabaseClient';

export async function favoritePost(userId: string, postId: string) {
  return supabase.from('favorites').insert({ profile_id: userId, post_id: postId });
}

export async function unfavoritePost(userId: string, postId: string) {
  return supabase.from('favorites').delete().eq('profile_id', userId).eq('post_id', postId);
}

export async function getFavoritedByUsers(postId: string): Promise<{ username: string }[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select('profiles(username)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return [];

  return data
    .map((row) => {
      const profile = row.profiles as unknown as { username: string } | null;
      return profile?.username ? { username: profile.username } : null;
    })
    .filter((item): item is { username: string } => item !== null);
}
