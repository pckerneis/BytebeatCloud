import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { PostList, type PostRow } from '../components/PostList';
import Head from 'next/head';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { enrichWithViewerFavorites } from '../utils/favorites';

export default function ExplorePage() {
  const { user } = useSupabaseAuth();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [activeTab, setActiveTab] = useState<'personalized' | 'recent' | 'popular'>('recent');
  const [hasInitializedTab, setHasInitializedTab] = useState(false);

  useEffect(() => {
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

      let data: PostRow[] | null = null;
      let error: any = null;

      if (activeTab === 'personalized') {
        if (!user) {
          data = [];
        } else {
          const rpcResult = await supabase.rpc('get_personalized_feed', {
            viewer_id: (user as any).id,
            page,
          });
          data = (rpcResult.data ?? []) as PostRow[];
          error = rpcResult.error;
        }
      } else {
        let query = supabase
          .from('posts_with_meta')
          .select(
            'id,title,expression,sample_rate,mode,created_at,profile_id,is_draft,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count',
          )
          .eq('is_draft', false);

        if (activeTab === 'recent') {
          query = query.order('created_at', { ascending: false });
        } else {
          // Order by favorites_count from posts_with_meta first, then recency.
          query = query
            .order('favorites_count', { ascending: false })
            .order('created_at', { ascending: false });
        }

        const result = await query.range(from, to);
        data = (result.data ?? []) as PostRow[];
        error = result.error;
      }

      if (cancelled) return;

      if (error) {
        setError(error.message ?? String(error));
        if (page === 0) {
          setPosts([]);
        }
        setHasMore(false);
      } else {
        let rows = (data ?? []) as PostRow[];

        if (user && rows.length > 0) {
          rows = (await enrichWithViewerFavorites((user as any).id as string, rows)) as PostRow[];
        }

        setPosts((prev) => {
          const combined = page === 0 ? rows : [...prev, ...rows];

          if (activeTab === 'personalized' || activeTab === 'recent') {
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

  // When a user first becomes authenticated, default to the personalized tab once.
  useEffect(() => {
    if (!user) return;
    if (hasInitializedTab) return;

    setActiveTab('personalized');
    setPage(0);
    setPosts([]);
    setHasMore(true);
    setError('');
    loadingMoreRef.current = false;
    setHasInitializedTab(true);
  }, [user, hasInitializedTab]);

  useInfiniteScroll({ hasMore, loadingMoreRef, sentinelRef, setPage });

  const handleTabClick = (tab: 'personalized' | 'recent' | 'popular') => {
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
        <title>BytebeatCloud - Explore</title>
      </Head>
      <section>
        <h2>Explore</h2>
        <div className="tab-header">
          {user && (
            <span
              className={`tab-button ${activeTab === 'personalized' ? 'active' : ''}`}
              onClick={() => handleTabClick('personalized')}
            >
              Feed
            </span>
          )}
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
