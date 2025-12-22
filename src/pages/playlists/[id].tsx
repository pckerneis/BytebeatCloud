import { useRouter } from 'next/router';
import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { PostList, type PostRow } from '../../components/PostList';
import { formatAuthorUsername, formatPostTitle } from '../../utils/post-format';
import Link from 'next/link';

interface PlaylistRow {
  id: string;
  title: string;
  description: string | null;
  visibility: 'public' | 'unlisted' | 'private';
  owner_id: string;
  owner_username: string;
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
  const [isReordering, setIsReordering] = useState(false);
  const [reorderItems, setReorderItems] = useState<PostRow[]>([]);
  const [reorderPending, setReorderPending] = useState(false);
  const [reorderError, setReorderError] = useState('');
  const dragIndexRef = useRef<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

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
        .select('id, title, description, visibility, owner_id, created_at, updated_at, owner:profiles!playlists_owner_id_fkey(username)')
        .eq('id', playlistId)
        .maybeSingle();

      if (cancelled) return;

      if (plErr || !pl) {
        setError('Playlist not found or not accessible.');
        setLoading(false);
        return;
      }

      const ownerField: any = (pl as any).owner;
      const ownerUsername: string = Array.isArray(ownerField)
        ? (ownerField[0]?.username as string) ?? ''
        : ((ownerField?.username as string) ?? '');

      const playlistRow: PlaylistRow = {
        id: pl.id,
        title: pl.title,
        description: pl.description ?? null,
        visibility: pl.visibility,
        owner_id: pl.owner_id,
        owner_username: ownerUsername,
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
        <h2>{playlist?.title ?? 'Playlist' }</h2>
        {loading && <p>Loading…</p>}
        {!loading && error && <p className="error-message">{error}</p>}
        {!loading && !error && playlist && (
          <>
            <div className="playlist-header">
              <span className="secondary-text">A playlist by{' '}<Link href={`/u/${playlist.owner_username}`}>@{formatAuthorUsername(playlist.owner_username)}</Link></span>
              <div className="chips">
                <span className="chip" style={{ fontSize: 12 }}>{playlist.visibility}</span>
              </div>
              {playlist.description && (
                <p className="secondary-text" style={{ marginTop: 8 }}>{playlist.description}</p>
              )}
            </div>
            {currentUserId && playlist.owner_id === currentUserId && posts.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                {!isReordering ? (
                  <button type="button" className="button secondary" onClick={() => {
                    setIsReordering(true);
                    setReorderItems(posts);
                    setReorderError('');
                  }}>
                    Reorder
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="button"
                      disabled={reorderPending}
                      onClick={async () => {
                        if (!playlistId) return;
                        setReorderPending(true);
                        setReorderError('');
                        try {
                          for (let i = 0; i < reorderItems.length; i++) {
                            const post = reorderItems[i];
                            const tempPosition = -i - 1; // unique temporary position
                            const { error: tempErr } = await supabase
                              .from('playlist_entries')
                              .update({ position: tempPosition })
                              .eq('playlist_id', playlistId)
                              .eq('post_id', post.id);
                            if (tempErr) throw tempErr;
                          }

                          // Phase 2: set final sequential positions (1-based) in the desired order
                          for (let i = 0; i < reorderItems.length; i++) {
                            const post = reorderItems[i];
                            const finalPosition = i + 1;
                            const { error: finalErr } = await supabase
                              .from('playlist_entries')
                              .update({ position: finalPosition })
                              .eq('playlist_id', playlistId)
                              .eq('post_id', post.id);
                            if (finalErr) throw finalErr;
                          }
                          setPosts(reorderItems);
                          setIsReordering(false);
                        } catch (e: any) {
                          setReorderError(e?.message || 'Failed to save new order.');
                        } finally {
                          setReorderPending(false);
                        }
                      }}
                    >
                      {reorderPending ? 'Saving…' : 'Save order'}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={reorderPending}
                      onClick={() => {
                        setIsReordering(false);
                        setReorderItems(posts);
                        setReorderError('');
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}
            {reorderError && (
              <p className="error-message" style={{ marginTop: 8 }}>{reorderError}</p>
            )}
            <div style={{ marginTop: 16 }}>
              {posts.length === 0 ? (
                <p className="secondary-text">No entries yet.</p>
              ) : isReordering ? (
                <ul
                  style={{ listStyle: 'none', padding: 0, margin: 0 }}
                  onDragOver={(e) => {
                    // When dragging over the list but not over a specific item,
                    // default the drop index to the end of the list.
                    e.preventDefault();
                    // Only act when hovering the list container itself (not child items)
                    if (e.target !== e.currentTarget) return;
                    if (dropIndex !== reorderItems.length) setDropIndex(reorderItems.length);
                  }}
                >
                  {reorderItems.map((p, idx) => (
                    <>
                      <li
                        key={p.id}
                        draggable
                        onDragStart={() => { dragIndexRef.current = idx; setDraggingIndex(idx); setDropIndex(idx + 1); }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const desired = idx + 1;
                          if (dropIndex !== desired) setDropIndex(desired);
                        }}
                        onDragEnd={() => {
                          // If the drag ended without a drop, move to the latest valid drop index
                          // Default to end of list when no dropIndex is set
                          if (dragIndexRef.current !== null) {
                            const from = dragIndexRef.current;
                            const toRaw = dropIndex ?? reorderItems.length;
                            if (!(from === toRaw || from + 1 === toRaw)) {
                              setReorderItems((prev) => {
                                const next = [...prev];
                                const [moved] = next.splice(from, 1);
                                let insertAt = toRaw;
                                if (from < toRaw) insertAt = toRaw - 1;
                                next.splice(insertAt, 0, moved);
                                return next;
                              });
                            }
                          }
                          dragIndexRef.current = null;
                          setDraggingIndex(null);
                          setDropIndex(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const from = dragIndexRef.current;
                          if (from === null) return;
                          const toRaw = dropIndex ?? (idx + 1);
                          if (from === toRaw || from + 1 === toRaw) { setDropIndex(null); return; }
                          setReorderItems((prev) => {
                            const next = [...prev];
                            const [moved] = next.splice(from, 1);
                            let insertAt = toRaw;
                            if (from < toRaw) insertAt = toRaw - 1; // account for removal shift
                            next.splice(insertAt, 0, moved);
                            return next;
                          });
                          dragIndexRef.current = null;
                          setDraggingIndex(null);
                          setDropIndex(null);
                        }}
                        className="playlist-reorder-row"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                          opacity: draggingIndex === idx ? 0.5 : 1,
                        }}
                        aria-grabbed={draggingIndex === idx}
                      >
                        <span style={{ cursor: 'grab' }} aria-label="Drag handle">⋮⋮</span>
                        <span className="secondary-text" style={{ width: 24, textAlign: 'right' }}>{idx + 1}.</span>
                        <span style={{ fontWeight: 600 }}>{formatPostTitle(p.title)}</span>{' '}
                        <span className="secondary-text">by @{formatAuthorUsername(p.author_username)}</span>
                      </li>
                      {dropIndex === idx + 1 && idx < reorderItems.length - 1 && (
                        <li
                          key={`placeholder-${idx + 1}`}
                          style={{
                            height: 0,
                            borderTop: '2px solid var(--accent, #6cf)',
                            margin: '2px 0',
                          }}
                        />
                      )}
                    </>
                  ))}
                  {dropIndex === reorderItems.length && (
                    <li
                      key={`placeholder-end`}
                      style={{
                        height: 0,
                        borderTop: '2px solid var(--accent, #6cf)',
                        margin: '2px 0',
                      }}
                    />
                  )}
                </ul>
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
