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
  const [activeTab, setActiveTab] = useState<'posts' | 'favorites'>('posts');
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
        .select('id,title,expression,is_draft,sample_rate,mode,created_at,profile_id,profiles(username),favorites(count)')
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
        let rows = (data ?? []).map((row: any) => ({
          ...row,
          favorites_count: row.favorites?.[0]?.count ?? 0,
        }));

        if (user && rows.length > 0) {
          const postIds = rows.map((r: any) => r.id);
          const { data: favs, error: favError } = await supabase
            .from('favorites')
            .select('post_id')
            .eq('profile_id', (user as any).id)
            .in('post_id', postIds);

          if (!favError && favs) {
            const favoritedSet = new Set((favs as any[]).map((f) => f.post_id as string));
            rows = rows.map((r: any) => ({
              ...r,
              favorited_by_current_user: favoritedSet.has(r.id),
            }));
          }
        }

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

      <div className="tab-header">
        <span
          className={activeTab === 'posts' ? 'tab-button active' : 'tab-button'}
          onClick={() => setActiveTab('posts')}
        >
          Posts
        </span>
        <span
          className={activeTab === 'favorites' ? 'tab-button active' : 'tab-button'}
          onClick={() => setActiveTab('favorites')}
        >
          Favorites
        </span>
      </div>

      {activeTab === 'posts' && (
        <>
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
        </>
      )}

      {activeTab === 'favorites' && (
        <p className="text-centered">Favorites listing coming soon.</p>
      )}
    </section>
  );
}
