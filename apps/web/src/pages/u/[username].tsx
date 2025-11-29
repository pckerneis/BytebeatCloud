import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { PostList, type PostRow } from '../../components/PostList';

export default function UserPage() {
  const router = useRouter();
  const { username } = router.query;
  const { user } = useSupabaseAuth();

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [hasLoadedFirstPage, setHasLoadedFirstPage] = useState(false);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset pagination when username changes
  useEffect(() => {
    setPosts([]);
    setPage(0);
    setHasMore(true);
    setHasLoadedFirstPage(false);
  }, [username]);

  // Paginated load of this user's public posts by username
  useEffect(() => {
    if (!supabase) return;
    if (!username || typeof username !== 'string') return;

    let cancelled = false;
    const pageSize = 20;
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const loadPage = async () => {
      loadingMoreRef.current = true;
      if (page === 0) {
        setLoading(true);
      }
      setError('');

      const { data, error } = await supabase
        .from('posts')
        .select('id,title,expression,is_draft,sample_rate,mode,created_at,profile_id,profiles(username)')
        .eq('profiles.username', username)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (cancelled) return;

      if (error) {
        // eslint-disable-next-line no-console
        console.warn('Error loading user posts', error.message);
        setError('Unable to load posts.');
        if (page === 0) {
          setPosts([]);
          setHasLoadedFirstPage(true);
        }
        setHasMore(false);
      } else {
        const rows = data ?? [];
        setPosts((prev) => (page === 0 ? rows : [...prev, ...rows]));
        if (page === 0) {
          setHasLoadedFirstPage(true);
        }
        if (rows.length < pageSize) {
          setHasMore(false);
        }
      }

      loadingMoreRef.current = false;
      setLoading(false);
    };

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [username, page]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!hasMore) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !loadingMoreRef.current && hasMore) {
          loadingMoreRef.current = true;
          setPage((p) => p + 1);
        }
      });
    });

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore]);

  return (
    <section>
      <h2>{typeof username === 'string' ? `@${username}` : 'User'}</h2>
      <h3>Posts</h3>
      {loading && <p>Loading…</p>}
      {!loading && error && <p className="error-message">{error}</p>}

      {hasLoadedFirstPage && !loading && !error && page === 0 && !hasMore && posts.length === 0 && (
        <p>This user has no public posts yet.</p>
      )}



      {!loading && !error && posts.length > 0 && (
        <PostList
          posts={posts}
          currentUserId={user ? (user as any).id : undefined}
        />
      )}

      <div ref={sentinelRef} style={{ height: 1 }} />
      {hasMore && !loading && posts.length > 0 && (
        <p className="text-centered">Loading more…</p>
      )}

      {!hasMore && !loading && posts.length > 0 && (
        <p className="text-centered">You reached the end!</p>
      )}
    </section>
  );
}
