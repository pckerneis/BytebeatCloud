import { useRouter } from 'next/router';
import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useSupabaseAuth } from '../../../hooks/useSupabaseAuth';
import type { PostRow } from '../../../components/PostList';
import { formatAuthorUsername, formatPostTitle } from '../../../utils/post-format';
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

export default function PlaylistEditPage() {
  const router = useRouter();
  const { id } = router.query;
  const playlistId = typeof id === 'string' ? id : null;

  const { user } = useSupabaseAuth();
  const currentUserId = useMemo(() => (user ? (user as any).id : null), [user]);

  const [playlist, setPlaylist] = useState<PlaylistRow | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reorderItems, setReorderItems] = useState<PostRow[]>([]);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState('');
  const dragIndexRef = useRef<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [removedPostIds, setRemovedPostIds] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLUListElement | null>(null);
  const [dropY, setDropY] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    if (!draggingIndex) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

      const ul = listRef.current;
      if (!ul) return;

      const items = Array.from(ul.querySelectorAll('li[data-index]')) as HTMLLIElement[];
      if (items.length === 0) {
        setDropIndex(0);
        setDropY(0);
        return;
      }

      const ulRect = ul.getBoundingClientRect();
      const y = e.clientY;
      
      for (let i = 0; i < items.length; i++) {
        const rect = items[i].getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (y < midY) {
          setDropIndex(i);
          setDropY(rect.top - ulRect.top);
          return;
        }
      }
      
      const lastRect = items[items.length - 1].getBoundingClientRect();
      setDropIndex(items.length);
      setDropY(lastRect.bottom - ulRect.top);
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const from = dragIndexRef.current;
      if (from === null) return;

      const to = dropIndex ?? reorderItems.length;
      if (from !== to && from + 1 !== to) {
        setReorderItems((prev) => {
          const next = [...prev];
          const [moved] = next.splice(from, 1);
          const insertAt = from < to ? to - 1 : to;
          next.splice(insertAt, 0, moved);
          return next;
        });
      }

      dragIndexRef.current = null;
      setDraggingIndex(null);
      setDropIndex(null);
      setDropY(null);
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [draggingIndex, dropIndex, reorderItems.length]);

  useEffect(() => {
    if (!playlistId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      setPlaylist(null);
      setPosts([]);

      const { data: pl, error: plError } = await supabase
        .from('playlists')
        .select('id, title, description, visibility, owner_id, created_at, updated_at, owner:profiles!playlists_owner_id_fkey(username)')
        .eq('id', playlistId)
        .maybeSingle();

      if (cancelled) return;

      if (plError || !pl) {
        setError('Playlist not found.');
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
      setEditTitle(pl.title);
      setEditDescription(pl.description ?? '');

      const { data: entries, error: entriesError } = await supabase
        .from('playlist_entries')
        .select('post_id, position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true });

      if (cancelled) return;

      if (entriesError) {
        setError('Failed to load playlist entries.');
        setLoading(false);
        return;
      }

      if (!entries || entries.length === 0) {
        setLoading(false);
        return;
      }

      const postIds = entries.map((e) => e.post_id);
      const { data: postsData, error: postsError } = await supabase
        .from('posts_with_meta')
        .select('id, title, author_username')
        .in('id', postIds);

      if (cancelled) return;

      if (postsError) {
        setError('Failed to load posts.');
        setLoading(false);
        return;
      }

      const postsMap = new Map((postsData ?? []).map((p) => [p.id, p as PostRow]));
      const orderedPosts: PostRow[] = entries
        .map((e) => postsMap.get(e.post_id))
        .filter((p): p is PostRow => p !== undefined);

      setPosts(orderedPosts);
      setReorderItems(orderedPosts);
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  const handleSave = async () => {
    if (!playlistId) return;
    setSavePending(true);
    setSaveError('');
    try {
      // Update playlist title and description
      const { error: updateErr } = await supabase
        .from('playlists')
        .update({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
        })
        .eq('id', playlistId);
      if (updateErr) throw updateErr;

      // First, delete removed items
      for (const postId of removedPostIds) {
        const { error: delErr } = await supabase
          .from('playlist_entries')
          .delete()
          .eq('playlist_id', playlistId)
          .eq('post_id', postId);
        if (delErr) throw delErr;
      }

      // Filter out removed items from reorderItems
      const finalItems = reorderItems.filter(p => !removedPostIds.has(p.id));

      // Phase 1: set temporary positions to avoid unique constraint violation
      for (let i = 0; i < finalItems.length; i++) {
        const post = finalItems[i];
        const tempPosition = -i - 1;
        const { error: tempErr } = await supabase
          .from('playlist_entries')
          .update({ position: tempPosition })
          .eq('playlist_id', playlistId)
          .eq('post_id', post.id);
        if (tempErr) throw tempErr;
      }

      // Phase 2: set final sequential positions (1-based) in the desired order
      for (let i = 0; i < finalItems.length; i++) {
        const post = finalItems[i];
        const finalPosition = i + 1;
        const { error: finalErr } = await supabase
          .from('playlist_entries')
          .update({ position: finalPosition })
          .eq('playlist_id', playlistId)
          .eq('post_id', post.id);
        if (finalErr) throw finalErr;
      }

      // Navigate back to playlist detail page
      void router.push(`/playlists/${playlistId}`);
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save changes.');
    } finally {
      setSavePending(false);
    }
  };

  const handleCancel = () => {
    void router.push(`/playlists/${playlistId}`);
  };

  // Check authorization
  const isOwner = currentUserId && playlist && playlist.owner_id === currentUserId;
  const unauthorized = !loading && playlist && !isOwner;

  const pageTitle = playlist ? `Edit ${playlist.title} - BytebeatCloud` : 'Edit Playlist - BytebeatCloud';

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <section>
        <button type="button" className="button ghost" onClick={() => router.back()}>
          ← Back
        </button>
        {loading && <p>Loading…</p>}
        {!loading && error && <p className="error-message">{error}</p>}
        {unauthorized && (
          <p className="error-message">You don't have permission to edit this playlist.</p>
        )}
        {!loading && !error && isOwner && playlist && (
          <>
            <h2>Edit Playlist</h2>
            <div className="create-form">
              <div className="field">
                <label style={{ fontWeight: 600 }}>Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Playlist title"
                  className="border-bottom-accent-focus"
                  disabled={savePending}
                />
              </div>
              <div className="field">
                <label style={{ fontWeight: 600 }}>Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Playlist description (optional)"
                  rows={3}
                  className="border-bottom-accent-focus"
                  disabled={savePending}
                />
              </div>
            </div>

            {saveError && (
              <p className="error-message" style={{ marginTop: 8 }}>{saveError}</p>
            )}

            <div style={{ marginTop: 16 }}>
              {posts.length === 0 ? (
                <p className="secondary-text">No entries yet.</p>
              ) : (
                <ul
                  ref={listRef}
                  style={{ listStyle: 'none', padding: 0, margin: 0, position: 'relative' }}
                >
                  {dropIndex !== null && dropY !== null && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        height: 2,
                        backgroundColor: 'var(--accent, #6cf)',
                        top: dropY,
                        pointerEvents: 'none',
                        zIndex: 10,
                      }}
                    />
                  )}
                  {reorderItems.filter(p => !removedPostIds.has(p.id)).map((p, idx) => (
                    <li
                      key={p.id}
                      data-index={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        opacity: draggingIndex === idx ? 0.5 : 1,
                      }}
                    >
                      <span
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', p.id);
                          dragIndexRef.current = idx;
                          setDraggingIndex(idx);
                        }}
                        onDragEnd={() => {
                          dragIndexRef.current = null;
                          setDraggingIndex(null);
                          setDropIndex(null);
                          setDropY(null);
                        }}
                        style={{ cursor: 'grab' }}
                        aria-label="Drag handle"
                      >
                        ⋮⋮
                      </span>
                        <span className="secondary-text" style={{ width: 24, textAlign: 'right' }}>{idx + 1}.</span>
                        <span style={{ fontWeight: 600 }}>{formatPostTitle(p.title)}</span>{' '}
                        <span className="secondary-text">by @{formatAuthorUsername(p.author_username)}</span>
                        <button
                          type="button"
                          className="button danger small ml-auto"
                          disabled={savePending}
                          onClick={() => {
                            setRemovedPostIds(prev => new Set(prev).add(p.id));
                          }}
                          aria-label={`Remove ${formatPostTitle(p.title)} from playlist`}
                        >
                          Remove
                        </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-30" style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="button"
                disabled={savePending || !editTitle.trim()}
                onClick={handleSave}
              >
                {savePending ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={savePending}
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
