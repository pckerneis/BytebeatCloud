import { supabase } from '../lib/supabaseClient';

export async function enrichWithTags(rows: any[]): Promise<any[]> {
  if (!rows || rows.length === 0) return rows;

  const postIds = rows.map((r: any) => r.id as string);

  const { data, error } = await supabase
    .from('post_tags')
    .select('post_id, tags(name)')
    .in('post_id', postIds);

  if (error || !data) return rows;

  const map = new Map<string, string[]>();

  for (const row of data as any[]) {
    const postId = row.post_id as string;
    const tagName = row.tags?.name as string | undefined;
    if (!postId || !tagName) continue;

    const normalized = tagName.toLowerCase();
    const arr = map.get(postId) ?? [];
    if (!arr.includes(normalized)) {
      arr.push(normalized);
      map.set(postId, arr);
    }
  }

  return rows.map((r: any) => ({
    ...r,
    tags: map.get(r.id as string) ?? [],
  }));
}
