import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { PostList, type PostRow } from '../components/PostList';
import Head from 'next/head';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { enrichWithViewerFavorites } from '../utils/favorites';
import { enrichWithTags } from '../utils/tags';
import Link from 'next/link';
import { validateExpression } from '../utils/expression-validator';
import { useTabState } from '../hooks/useTabState';

const tabs = ['feed', 'recent', 'weekly'] as const;
type TabName = (typeof tabs)[number];

function shuffle<T>(arr: T[]): T[] {
  const newArr = [...arr];

  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }

  return newArr;
}

export default function ExplorePage() {
  const { user } = useSupabaseAuth();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [hasActiveChallenge, setHasActiveChallenge] = useState<boolean | null>(null);

  const resetPagination = useCallback(() => {
    setPosts([]);
    setPage(0);
    setHasMore(true);
    setError('');
    loadingMoreRef.current = false;
  }, []);

  const [activeTab, setActiveTab] = useTabState(tabs, 'feed', { onTabChange: resetPagination });

  // Check if there's an active weekly challenge on mount
  useEffect(() => {
    let cancelled = false;

    const checkChallenge = async () => {
      const { data } = await supabase.rpc('get_current_week_data');
      if (cancelled) return;
      setHasActiveChallenge(data !== null);
    };

    void checkChallenge();

    return () => {
      cancelled = true;
    };
  }, []);

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

      if (activeTab === 'weekly') {
        const rpcResult = await supabase.rpc('get_current_week_data');
        const weeklyData = rpcResult.data as any;
        error = rpcResult.error;

        if (!error && weeklyData && Array.isArray(weeklyData.participants)) {
          const ids = weeklyData.participants
            .map((p: any) => p.id as string | null)
            .filter((id: string | null): id is string => !!id);

          if (ids.length > 0) {
            const result = await supabase
              .from('posts_with_meta')
              .select(
                'id,title,expression,sample_rate,mode,created_at,profile_id,is_draft,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count,is_weekly_winner',
              )
              .in('id', ids);

            data = shuffle(result.data ?? []) as PostRow[];
            if (result.error) {
              error = result.error;
            }
          } else {
            data = [];
          }

          // Weekly challenge tab is a single page.
          setHasMore(false);
        } else {
          data = [];
          setHasMore(false);
        }
      } else if (activeTab === 'feed') {
        if (user) {
          const rpcResult = await supabase.rpc('get_personalized_feed', {
            viewer_id: (user as any).id,
            page,
          });
          data = (rpcResult.data ?? []) as PostRow[];
          error = rpcResult.error;
        } else {
          const rpcResult = await supabase.rpc('get_global_feed', {
            page,
          });
          data = (rpcResult.data ?? []) as PostRow[];
          error = rpcResult.error;
        }
      } else if (activeTab === 'recent') {
        const result = await supabase
          .from('posts_with_meta')
          .select(
            'id,title,expression,sample_rate,mode,created_at,profile_id,is_draft,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count,is_weekly_winner',
          )
          .eq('is_draft', false)
          .order('created_at', { ascending: false })
          .range(from, to);

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

        if (rows.length > 0) {
          rows = (await enrichWithTags(rows)) as PostRow[];
        }

        // Security: drop posts with invalid expressions
        rows = rows.filter((r) => validateExpression(r.expression).valid);

        setPosts((prev) => (page === 0 ? rows : [...prev, ...rows]));
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

  const handleTabClick = (tab: TabName) => {
    setActiveTab(tab);
  };

  return (
    <>
      <Head>
        <title>Explore - BytebeatCloud</title>
        <meta name="description" content="Explore bytebeat creations on BytebeatCloud" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Explore - BytebeatCloud" />
        <meta property="og:description" content="Explore bytebeat creations on BytebeatCloud" />
        <meta
          property="og:image"
          content={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/og/default`}
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <section>
        <h2>Explore</h2>
        <div className="tab-header">
          <span
            className={`tab-button ${activeTab === 'feed' ? 'active' : ''}`}
            onClick={() => handleTabClick('feed')}
          >
            Feed
          </span>
          <span
            className={`tab-button ${activeTab === 'recent' ? 'active' : ''}`}
            onClick={() => handleTabClick('recent')}
          >
            Recent
          </span>
          {hasActiveChallenge && (
            <span
              className={`tab-button ${activeTab === 'weekly' ? 'active' : ''}`}
              onClick={() => handleTabClick('weekly')}
            >
              Weekly Challenge
            </span>
          )}
        </div>
        {loading && <p className="text-centered">Loading posts…</p>}
        {error && !loading && <p className="error-message">{error}</p>}
        {!loading && !error && posts.length === 0 && (
          <p className="text-centered">
            {activeTab === 'weekly' ? (
              <span>
                No submission yet.{' '}
                <Link href={'/create?weekly'}>Participate this week&#39;s challenge!</Link>
              </span>
            ) : (
              <span>
                No posts yet. Create something on the <Link href={'/create'}>Create</Link> page!
              </span>
            )}
          </p>
        )}
        {!loading && !error && posts.length > 0 && (
          <PostList posts={posts} currentUserId={user ? (user as any).id : undefined} />
        )}
        <div ref={sentinelRef} style={{ height: 1 }} data-testid="scroll-sentinel" />
        {hasMore && !loading && posts.length > 0 && <p className="text-centered">Loading more…</p>}

        {!hasMore && !loading && posts.length > 0 && (
          <p className="text-centered">You reached the end!</p>
        )}
      </section>
    </>
  );
}
