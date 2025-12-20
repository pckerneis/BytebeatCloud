import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
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
import { useFeedCache } from '../hooks/useFeedCache';

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
  const router = useRouter();
  const { user, loading: authLoading } = useSupabaseAuth();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [hasActiveChallenge, setHasActiveChallenge] = useState<boolean | null>(null);
  const [weekTheme, setWeekTheme] = useState('');
  const initialLoadDoneRef = useRef(false);
  const currentFetchRef = useRef(0);

  const resetPagination = useCallback(() => {
    setPosts([]);
    setPage(0);
    setHasMore(true);
    setError('');
    loadingMoreRef.current = false;
    initialLoadDoneRef.current = false;
    currentFetchRef.current += 1;
  }, []);

  const [activeTab, setActiveTab] = useTabState(tabs, 'feed', { onTabChange: resetPagination });

  // Stable userId that doesn't change during auth loading
  const userId = user ? (user as any).id : undefined;

  const feedCache = useFeedCache({
    tab: activeTab,
    userId,
  });
  
  // Track the cached page we restored to, so we don't re-fetch those pages
  const restoredFromCachePageRef = useRef<number | null>(null);

  // Restore from cache on mount or tab change (wait for auth to be ready)
  useEffect(() => {
    // Wait for auth to finish loading before trying to restore cache
    if (authLoading) {
      console.log('[Explore] Waiting for auth to load');
      return;
    }
    console.log('[Explore] Cache restore effect running', { activeTab, userId });
    const cached = feedCache.getCachedState();
    console.log('[Explore] Cached state:', { hasCached: !!cached, postsCount: cached?.posts?.length, cachedPage: cached?.page });
    if (cached && cached.posts.length > 0) {
      console.log('[Explore] Restoring from cache', { postsCount: cached.posts.length, page: cached.page });
      setPosts(cached.posts);
      setPage(cached.page);
      setHasMore(cached.hasMore);
      setLoading(false);
      initialLoadDoneRef.current = true;
      restoredFromCachePageRef.current = cached.page;
      // Restore scroll position after posts are rendered
      feedCache.restoreScrollPosition();
    } else {
      console.log('[Explore] No cache to restore');
      restoredFromCachePageRef.current = null;
    }
    // Only run on mount and when activeTab/userId changes (not on feedCache changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, userId, authLoading]);

  // Save scroll position before navigating away
  // Use a ref to capture the current feedCache.saveScrollPosition so it uses the correct cache key
  const saveScrollPositionRef = useRef(feedCache.saveScrollPosition);
  useEffect(() => {
    saveScrollPositionRef.current = feedCache.saveScrollPosition;
  }, [feedCache.saveScrollPosition]);

  useEffect(() => {
    const handleRouteChange = () => {
      console.log('[Explore] Route change - saving scroll position');
      saveScrollPositionRef.current();
    };

    router.events.on('routeChangeStart', handleRouteChange);
    return () => {
      router.events.off('routeChangeStart', handleRouteChange);
    };
  }, [router.events]);

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
    // Wait for auth to finish loading before fetching
    if (authLoading) {
      console.log('[Explore] Fetch effect waiting for auth');
      return;
    }
    console.log('[Explore] Fetch effect running', { page, activeTab, restoredFromCachePage: restoredFromCachePageRef.current });
    // Skip fetch if we restored from cache and this page was already loaded
    if (restoredFromCachePageRef.current !== null && page <= restoredFromCachePageRef.current) {
      console.log('[Explore] Skipping fetch - restored from cache', { page, restoredFromCachePage: restoredFromCachePageRef.current });
      // Clear the restored flag after we've skipped all cached pages
      if (page === restoredFromCachePageRef.current) {
        restoredFromCachePageRef.current = null;
      }
      return;
    }
    console.log('[Explore] Proceeding with fetch', { page });

    let cancelled = false;
    const fetchId = ++currentFetchRef.current;
    const pageSize = 20;
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const loadPage = async () => {
      loadingMoreRef.current = true;
      if (page === 0) {
        setLoading(true);
      }
      setError('');

      // Check if this fetch is still current
      if (fetchId !== currentFetchRef.current) return;

      let data: PostRow[] | null = null;
      let error: any = null;

      if (activeTab === 'weekly') {
        const rpcResult = await supabase.rpc('get_current_week_data');
        const weeklyData = rpcResult.data as any;
        error = rpcResult.error;

        if (!error) {
          setWeekTheme(weeklyData.challenge?.theme ?? '');
        }

        if (!error && weeklyData && Array.isArray(weeklyData.participants)) {
          const ids = weeklyData.participants
            .map((p: any) => p.id as string | null)
            .filter((id: string | null): id is string => !!id);

          if (ids.length > 0) {
            const result = await supabase
              .from('posts_with_meta')
              .select(
                'id,title,expression,sample_rate,mode,created_at,profile_id,is_draft,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count,is_weekly_winner,license,comments_count',
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
            'id,title,expression,sample_rate,mode,created_at,profile_id,is_draft,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count,is_weekly_winner,license,comments_count',
          )
          .eq('is_draft', false)
          .order('created_at', { ascending: false })
          .range(from, to);

        data = (result.data ?? []) as PostRow[];
        error = result.error;
      }

      if (cancelled || fetchId !== currentFetchRef.current) return;

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

        if (cancelled || fetchId !== currentFetchRef.current) return;

        if (rows.length > 0) {
          rows = (await enrichWithTags(rows)) as PostRow[];
        }

        if (cancelled || fetchId !== currentFetchRef.current) return;

        // Security: drop posts with invalid expressions
        rows = rows.filter((r) => validateExpression(r.expression).valid);

        const newPosts = page === 0 ? rows : [...posts, ...rows];
        const newHasMore = rows.length >= pageSize;
        
        setPosts(newPosts);
        setHasMore(newHasMore);
        
        // Update cache
        feedCache.updateCache(newPosts, page, newHasMore);
        initialLoadDoneRef.current = true;
      }

      loadingMoreRef.current = false;
      setLoading(false);
    };

    void loadPage();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, userId, activeTab, authLoading]);

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
        {activeTab === 'weekly' && (
          <div className="info-panel">
            <div>
              This tab shows the participants for the{' '}
              <Link href={'/about-weekly'}>Bytebeat of the Week challenge</Link>.
            </div>
            {weekTheme && <div>This week&apos;s theme is &quot;{weekTheme}&quot;</div>}
          </div>
        )}
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
