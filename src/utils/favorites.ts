import { supabase } from '../lib/supabaseClient';

export function attachFavoritesCount(rows: any[]): any[] {
  return (rows ?? []).map((row: any) => ({
    ...row,
    favorites_count: row.favorites?.[0]?.count ?? 0,
  }));
}

export function attachFavoritedByCurrentUser(rows: any[], favs: any[]): any[] {
  const favoritedSet = new Set((favs ?? []).map((f: any) => f.post_id as string));
  if (favoritedSet.size === 0) return rows;

  return rows.map((r: any) => ({
    ...r,
    favorited_by_current_user: favoritedSet.has(r.id),
  }));
}

export async function enrichWithViewerFavorites(viewerId: string, rows: any[]): Promise<any[]> {
  if (!viewerId || !rows || rows.length === 0) return rows;

  const postIds = rows.map((r: any) => r.id);
  const { data: favs, error } = await supabase
    .from('favorites')
    .select('post_id')
    .eq('profile_id', viewerId)
    .in('post_id', postIds);

  if (error || !favs) return rows;

  return attachFavoritedByCurrentUser(rows, favs as any[]);
}
