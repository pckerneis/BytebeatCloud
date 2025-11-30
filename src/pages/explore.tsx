import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { PostList, type PostRow } from '../components/PostList';
import Head from 'next/head';
import { APP_NAME } from '../constants';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';

export default function ExplorePage() {
  const { user } = useSupabaseAuth();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [activeTab, setActiveTab] = useState<'recent' | 'popular'>('recent');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError('Supabase client is not configured.');
      return;
    }

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

      let query = supabase
        .from('posts')
        .select(
          'id,title,expression,sample_rate,mode,created_at,profile_id,profiles(username),favorites(count)',
        )
        .eq('is_draft', false);

      if (activeTab === 'recent') {
        query = query.order('created_at', { ascending: false });
      } else {
        // Order by favorites count first, then recency as a tiebreaker.
        query = query
          .order('count', { foreignTable: 'favorites', ascending: false })
          .order('created_at', { ascending: false });
      }

      const { data, error } = await query.range(from, to);

      if (cancelled) return;

      if (error) {
        setError(error.message);
        if (page === 0) {
          setPosts([]);
        }
        setHasMore(false);
      } else {
        let rows = (data ?? []).map((row: any) => ({
          ...row,
          favorites_count: row.favorites?.[0]?.count ?? 0,
        }));

        // If a user is logged in, mark which of these posts they have favorited.
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

        setPosts((prev) => {
          const combined = page === 0 ? rows : [...prev, ...rows];

          if (activeTab !== 'popular') {
            return combined;
          }

          return [...combined].sort((a, b) => {
            const fa = a.favorites_count ?? 0;
            const fb = b.favorites_count ?? 0;
            if (fb !== fa) return fb - fa;

            const da = new Date(a.created_at).getTime();
            const db = new Date(b.created_at).getTime();
            return db - da;
          });
        });
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
  }, [page, user, activeTab]);

  useInfiniteScroll({ hasMore, loadingMoreRef, sentinelRef, setPage });

  const handleTabClick = (tab: 'recent' | 'popular') => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setPage(0);
    setPosts([]);
    setHasMore(true);
    setError('');
    loadingMoreRef.current = false;
  };

  return (
    <>
      <Head>
        <title>{APP_NAME} - Explore</title>
      </Head>
      <section>
        <h2>Explore</h2>
        <div className="tab-header">
          <span
            className={`tab-button ${activeTab === 'recent' ? 'active' : ''}`}
            onClick={() => handleTabClick('recent')}
          >
            Recent
          </span>
          <span
            className={`tab-button ${activeTab === 'popular' ? 'active' : ''}`}
            onClick={() => handleTabClick('popular')}
          >
            Popular
          </span>
        </div>
        {loading && <p className="text-centered">Loading posts…</p>}
        {error && !loading && <p className="error-message">{error}</p>}
        {!loading && !error && posts.length === 0 && (
          <p className="text-centered">No posts yet. Create something on the Create page!</p>
        )}
        {!loading && !error && posts.length > 0 && (
          <PostList posts={posts} currentUserId={user ? (user as any).id : undefined} />
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {hasMore && !loading && posts.length > 0 && <p className="text-centered">Loading more…</p>}

        {!hasMore && !loading && posts.length > 0 && (
          <p className="text-centered">You reached the end!</p>
        )}
      </section>
    </>
  );
}
