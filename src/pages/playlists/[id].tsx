import { useRouter } from 'next/router';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { PostList, type PostRow } from '../../components/PostList';

interface PlaylistRow {
  id: string;
  title: string;
  description: string | null;
  visibility: 'public' | 'unlisted' | 'private';
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export default function PlaylistDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const playlistId = typeof id === 'string' ? id : null;

  const { user } = useSupabaseAuth();
  const currentUserId = useMemo(() => (user ? (user as any).id : null), [user]);

  const [playlist, setPlaylist] = useState<PlaylistRow | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!playlistId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      setPlaylist(null);
      setPosts([]);

      // Load playlist metadata
      const { data: pl, error: plErr } = await supabase
        .from('playlists')
        .select('id, title, description, visibility, owner_id, created_at, updated_at')
        .eq('id', playlistId)
        .maybeSingle();

      if (cancelled) return;

      if (plErr || !pl) {
        setError('Playlist not found or not accessible.');
        setLoading(false);
        return;
      }

      const playlistRow: PlaylistRow = {
        id: pl.id,
        title: pl.title,
        description: pl.description ?? null,
        visibility: pl.visibility,
        owner_id: pl.owner_id,
        created_at: pl.created_at,
        updated_at: pl.updated_at,
      };
      setPlaylist(playlistRow);

      // Load entry positions
      const { data: entries, error: entErr } = await supabase
        .from('playlist_entries')
        .select('post_id, position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true });

      if (cancelled) return;

      if (entErr) {
        setError('Failed to load playlist entries.');
        setLoading(false);
        return;
      }

      const postIds: string[] = (entries ?? []).map((e: any) => e.post_id);
      if (postIds.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }

      // Load posts metadata
      const { data: postRows, error: postErr } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,description,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count,is_weekly_winner,license,comments_count'
        )
        .in('id', postIds);

      if (cancelled) return;

      if (postErr || !postRows) {
        setError('Failed to load posts for this playlist.');
        setLoading(false);
        return;
      }

      // Map to order by entry position
      const byId = new Map<string, PostRow>();
      for (const r of postRows as PostRow[]) {
        byId.set(r.id, r);
      }
      const ordered: PostRow[] = [];
      for (const e of entries as Array<{ post_id: string; position: number }>) {
        const p = byId.get(e.post_id);
        if (p) ordered.push(p);
      }

      setPosts(ordered);
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  const pageTitle = playlist ? `${playlist.title} - Playlist - BytebeatCloud` : 'Playlist - BytebeatCloud';

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <section>
        <button type="button" className="button ghost" onClick={() => router.back()}>
          ← Back
        </button>
        <h2>Playlist</h2>
        {loading && <p>Loading…</p>}
        {!loading && error && <p className="error-message">{error}</p>}
        {!loading && !error && playlist && (
          <>
            <div className="info-panel" style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <h3 style={{ margin: 0 }}>{playlist.title}</h3>
              <span className="secondary-text" style={{ fontSize: 12 }}>({playlist.visibility})</span>
            </div>
            {playlist.description && (
              <p className="secondary-text" style={{ marginTop: 8 }}>{playlist.description}</p>
            )}
            <div style={{ marginTop: 16 }}>
              {posts.length === 0 ? (
                <p className="secondary-text">No entries yet.</p>
              ) : (
                <PostList posts={posts} currentUserId={currentUserId ?? undefined} />
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
}
