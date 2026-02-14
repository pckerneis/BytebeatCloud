import { supabase } from '../lib/supabaseClient';
import type { SnippetRow } from '../model/snippet';

export async function searchSnippets(
  query: string,
  userId?: string,
): Promise<{ data: SnippetRow[]; error: string | null }> {
  const trimmed = query.trim();

  // Build a query that returns public snippets + user's own private snippets
  // matching the search term in name or description
  let q = supabase
    .from('snippets')
    .select('id, name, profile_id, created_at, description, snippet, is_public, profiles(username)')
    .order('created_at', { ascending: false })
    .limit(20);

  if (trimmed) {
    q = q.or(`name.ilike.%${trimmed}%,description.ilike.%${trimmed}%`);
  }

  const { data, error } = await q;

  if (error) {
    return { data: [], error: error.message };
  }

  const rows: SnippetRow[] = (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    profile_id: row.profile_id,
    created_at: row.created_at,
    description: row.description,
    snippet: row.snippet,
    is_public: row.is_public,
    username: (row.profiles as any)?.username ?? undefined,
  }));

  return { data: rows, error: null };
}

export async function getUserSnippets(
  profileId: string,
): Promise<{ data: SnippetRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('snippets')
    .select('id, name, profile_id, created_at, description, snippet, is_public')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as SnippetRow[], error: null };
}

export async function createSnippet(
  snippet: { name: string; snippet: string; description: string; is_public: boolean },
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('snippets').insert({
    name: snippet.name,
    snippet: snippet.snippet,
    description: snippet.description,
    is_public: snippet.is_public,
    profile_id: userId,
  });

  return { error: error?.message ?? null };
}

export async function deleteSnippet(snippetId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('snippets').delete().eq('id', snippetId);
  return { error: error?.message ?? null };
}
