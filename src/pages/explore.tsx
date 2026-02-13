import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { PostList, type PostRow } from '../components/PostList';
import Head from 'next/head';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { enrichWithTags } from '../utils/tags';
import Link from 'next/link';
import { validateExpression } from '../utils/expression-validator';
import { useTabState } from '../hooks/useTabState';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { PostDetailView } from '../components/PostDetailView';
import { PlaylistCard } from '../components/PlaylistCard';
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator';

const tabs = ['feed', 'recent', 'weekly'] as const;
type TabName = (typeof tabs)[number];
const contentTypes = ['posts', 'playlists'] as const;
type ContentType = (typeof contentTypes)[number];

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
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [scrollToComments, setScrollToComments] = useState(false);
  const isDetailOpen = Boolean(selectedPostId);

  interface PlaylistRow {
    id: string;
    title: string;
    description: string | null;
    owner_username: string | null;
    updated_at: string;
    postsCount?: number;
  }
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [playlistsError, setPlaylistsError] = useState('');
  const [pagePlaylists, setPagePlaylists] = useState(0);
  const [hasMorePlaylists, setHasMorePlaylists] = useState(true);
  const loadingMorePlaylistsRef = useRef(false);
  const playlistsInitialLoadDoneRef = useRef(false);
  const playlistsCurrentFetchRef = useRef(0);

  const resetPagination = useCallback(() => {
    setLoading(true);
    setPosts([]);
    setPage(0);
    setHasMore(true);
    setError('');
    loadingMoreRef.current = false;
    initialLoadDoneRef.current = false;
    currentFetchRef.current += 1;
    // Scroll to top when switching tabs
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTo(0, 0);
    } else {
      window.scrollTo(0, 0);
    }
  }, []);

  const resetPlaylistsPagination = useCallback(() => {
    setPlaylistsLoading(true);
    setPlaylists([]);
    setPagePlaylists(0);
    setHasMorePlaylists(true);
    setPlaylistsError('');
    loadingMorePlaylistsRef.current = false;
    playlistsInitialLoadDoneRef.current = false;
    playlistsCurrentFetchRef.current += 1;
  }, []);

  const [activeTab, setActiveTab] = useTabState(tabs, 'feed', { onTabChange: resetPagination });
  const [contentType, setContentType] = useTabState<ContentType>(contentTypes, 'posts', {
    queryParam: 'type',
    onTabChange: (t) => {
      if (t === 'posts') {
        resetPagination();
      } else {
        setPlaylists([]);
        setPagePlaylists(0);
        setHasMorePlaylists(true);
        setPlaylistsError('');
        loadingMorePlaylistsRef.current = false;
        playlistsInitialLoadDoneRef.current = false;
        playlistsCurrentFetchRef.current += 1;
        const mainEl = document.querySelector('main');
        if (mainEl) {
          mainEl.scrollTo(0, 0);
        } else {
          window.scrollTo(0, 0);
        }
      }
    },
  });

  const handleRefresh = useCallback(() => {
    if (contentType === 'posts') {
      resetPagination();
    } else {
      resetPlaylistsPagination();
    }
  }, [contentType, resetPagination, resetPlaylistsPagination]);

  const pullToRefreshState = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled:
      !isDetailOpen &&
      !loading &&
      (contentType === 'posts' ? !loadingMoreRef.current : !loadingMorePlaylistsRef.current),
    threshold: 80,
  });
  const postIdFromQuery = typeof router.query.post === 'string' ? router.query.post : null;

  // Stable userId that doesn't change during auth loading
  const userId = user ? (user as any).id : undefined;

  // Save scroll position when opening detail, restore when closing
  const savedScrollRef = useRef<number>(0);

  // Sync selectedPostId with query param
  useEffect(() => {
    if (postIdFromQuery) {
      if (postIdFromQuery !== selectedPostId) {
        // Save scroll before opening detail
        const mainEl = document.querySelector('main');
        savedScrollRef.current = mainEl?.scrollTop ?? window.scrollY;
        setSelectedPostId(postIdFromQuery);
      }
    } else if (selectedPostId) {
      // Closing detail - will restore scroll in next effect
      setSelectedPostId(null);
    }
  }, [postIdFromQuery, selectedPostId]);

  // Restore scroll when detail closes
  const prevDetailOpenRef = useRef(isDetailOpen);
  useEffect(() => {
    const wasOpen = prevDetailOpenRef.current;
    prevDetailOpenRef.current = isDetailOpen;

    // Only restore when transitioning from open to closed
    if (wasOpen && !isDetailOpen) {
      // Use multiple animation frames to ensure DOM is fully updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const mainEl = document.querySelector('main');
          if (mainEl) {
            mainEl.scrollTo(0, savedScrollRef.current);
          } else {
            window.scrollTo(0, savedScrollRef.current);
          }
        });
      });
    }
  }, [isDetailOpen]);

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
      return;
    }

    // Skip if we've already loaded this initial page
    if (page === 0 && initialLoadDoneRef.current && posts.length > 0) {
      return;
    }

    let cancelled = false;
    currentFetchRef.current += 1;
    const fetchId = currentFetchRef.current;
    const pageSize = 20;

    // Force page 0 if this is a fresh load (after reset)
    const actualPage = !initialLoadDoneRef.current ? 0 : page;
    const from = actualPage * pageSize;
    const to = from + pageSize - 1;

    const loadPage = async () => {
      loadingMoreRef.current = true;
      if (actualPage === 0) {
        setLoading(true);
      }
      setError('');

      // Check if this fetch is still current
      if (fetchId !== currentFetchRef.current) {
        loadingMoreRef.current = false;
        return;
      }

      if (contentType !== 'posts') {
        loadingMoreRef.current = false;
        setLoading(false);
        return;
      }

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
            const result = await supabase.from('posts_with_meta').select().in('id', ids);

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
            page: actualPage,
          });
          data = (rpcResult.data ?? []) as PostRow[];
          error = rpcResult.error;
        } else {
          const rpcResult = await supabase.rpc('get_global_feed', {
            page: actualPage,
          });
          data = (rpcResult.data ?? []) as PostRow[];
          error = rpcResult.error;
        }
      } else if (activeTab === 'recent') {
        const result = await supabase
          .from('posts_with_meta')
          .select()
          .eq('is_draft', false)
          .order('published_at', { ascending: false })
          .range(from, to);

        data = (result.data ?? []) as PostRow[];
        error = result.error;
      }

      if (cancelled || fetchId !== currentFetchRef.current) return;

      if (error) {
        setError(error.message ?? String(error));
        if (actualPage === 0) {
          setPosts([]);
        }
        setHasMore(false);
      } else {
        let rows = (data ?? []) as PostRow[];

        if (cancelled || fetchId !== currentFetchRef.current) return;

        if (rows.length > 0) {
          rows = (await enrichWithTags(rows)) as PostRow[];
        }

        if (cancelled || fetchId !== currentFetchRef.current) return;

        // Security: drop posts with invalid expressions
        rows = rows.filter((r) => validateExpression(r.expression).valid);

        const newPosts = actualPage === 0 ? rows : [...posts, ...rows];
        const newHasMore = rows.length >= pageSize;

        setPosts(newPosts);
        setHasMore(newHasMore);
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
  }, [page, userId, activeTab, authLoading, contentType]);

  useInfiniteScroll({
    hasMore: contentType === 'playlists' ? hasMorePlaylists : hasMore,
    loadingMoreRef: contentType === 'playlists' ? loadingMorePlaylistsRef : loadingMoreRef,
    sentinelRef,
    setPage: contentType === 'playlists' ? setPagePlaylists : setPage,
  });

  useEffect(() => {
    if (contentType !== 'playlists') return;

    if (pagePlaylists === 0 && playlistsInitialLoadDoneRef.current && playlists.length > 0) {
      return;
    }

    let cancelled = false;
    playlistsCurrentFetchRef.current += 1;
    const fetchId = playlistsCurrentFetchRef.current;
    const pageSize = 20;
    const from = pagePlaylists * pageSize;
    const to = from + pageSize - 1;

    const loadPlaylists = async () => {
      loadingMorePlaylistsRef.current = true;
      if (pagePlaylists === 0) setPlaylistsLoading(true);
      setPlaylistsError('');

      const { data, error } = await supabase
        .from('playlists')
        .select(
          'id, title, description, updated_at, owner:profiles!playlists_owner_id_fkey(username), entries:playlist_entries(count)',
        )
        .eq('visibility', 'public')
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (cancelled || fetchId !== playlistsCurrentFetchRef.current) return;

      if (error) {
        setPlaylistsError(error.message ?? String(error));
        if (pagePlaylists === 0) setPlaylists([]);
        setHasMorePlaylists(false);
      } else {
        const rows: PlaylistRow[] = (data ?? []).map((p: any) => ({
          id: p.id as string,
          title: p.title as string,
          description: (p.description as string) ?? null,
          updated_at: p.updated_at as string,
          owner_username: (p.owner?.username as string) ?? null,
          postsCount: (p.entries?.[0]?.count as number) ?? 0,
        }));

        const newRows = pagePlaylists === 0 ? rows : [...playlists, ...rows];
        const newHasMore = rows.length >= pageSize;
        setPlaylists(newRows);
        setHasMorePlaylists(newHasMore);
        playlistsInitialLoadDoneRef.current = true;
      }

      loadingMorePlaylistsRef.current = false;
      setPlaylistsLoading(false);
    };

    void loadPlaylists();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType, pagePlaylists]);

  const handleTabClick = (tab: TabName) => {
    setActiveTab(tab);
  };

  // Get available tabs based on whether there's an active challenge
  const availableTabs = hasActiveChallenge ? tabs : tabs.filter((t) => t !== 'weekly');

  // Handle swipe gestures to switch tabs
  const handleSwipeLeft = () => {
    if (contentType !== 'posts') return;
    const currentIndex = (availableTabs as readonly TabName[]).indexOf(activeTab);
    if (currentIndex < availableTabs.length - 1 && currentIndex !== -1) {
      const nextTab = availableTabs[currentIndex + 1];
      setActiveTab(nextTab as TabName);
    }
  };

  const handleSwipeRight = () => {
    if (contentType !== 'posts') return;
    const currentIndex = (availableTabs as readonly TabName[]).indexOf(activeTab);
    if (currentIndex > 0) {
      const prevTab = availableTabs[currentIndex - 1];
      setActiveTab(prevTab as TabName);
    }
  };

  const [searchInput, setSearchInput] = useState('');

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (q) {
      void router.push({ pathname: '/search', query: { terms: q } });
    }
  };

  const swipeState = useSwipeGesture({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    threshold: 100,
    enabled: !isDetailOpen && contentType === 'posts',
  });

  const handlePostClick = (post: PostRow) => {
    setScrollToComments(false);
    const nextQuery = { ...router.query, post: post.id };
    void router.push(
      {
        pathname: router.pathname,
        query: nextQuery,
      },
      undefined,
      { shallow: true },
    );
  };

  const handleCommentClick = (post: PostRow) => {
    setScrollToComments(true);
    const nextQuery = { ...router.query, post: post.id };
    void router.push(
      {
        pathname: router.pathname,
        query: nextQuery,
      },
      undefined,
      { shallow: true },
    );
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
      <PullToRefreshIndicator pullState={pullToRefreshState} threshold={80} />
      <section style={{ display: isDetailOpen ? 'none' : undefined }}>
        <h2>Explore</h2>

        <p>
          Explore{' '}
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value as ContentType)}
          >
            <option value="posts">posts</option>
            <option value="playlists">playlists</option>
          </select>
        </p>

        {contentType === 'posts' && (
          <form onSubmit={handleSearch} className="search-form">
                  <input
                    type="search"
                    className="search-input"
                    placeholder="Search posts…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  <button type="submit" className="button primary">
                    Search
                  </button>
                </form>
        )}

        {contentType === 'posts' ? (
          <div style={{ overflowX: 'hidden' }}>
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
              <div
                style={{
                  transform: `translateX(${swipeState.translateX}px)`,
                  transition: swipeState.isDragging ? 'none' : 'transform 0.3s ease-out',
                }}
              >
                <PostList
                  posts={posts}
                  currentUserId={user ? (user as any).id : undefined}
                  onPostClick={handlePostClick}
                  onCommentClick={handleCommentClick}
                />
              </div>
            )}
            <div ref={sentinelRef} style={{ height: 1 }} data-testid="scroll-sentinel" />
            {hasMore && !loading && posts.length > 0 && (
              <p className="text-centered">Loading more…</p>
            )}
            {!hasMore && !loading && posts.length > 0 && (
              <p className="text-centered">You reached the end!</p>
            )}
          </div>
        ) : (
          <>
            <div className="tab-header">
              <span className="tab-button active">Recently Updated</span>
            </div>
            {playlistsLoading && <p className="text-centered">Loading playlists…</p>}
            {playlistsError && !playlistsLoading && (
              <p className="error-message">{playlistsError}</p>
            )}
            {!playlistsLoading && !playlistsError && playlists.length === 0 && (
              <p className="text-centered">No playlists yet.</p>
            )}
            {!playlistsLoading && !playlistsError && playlists.length > 0 && (
              <div className="playlists-section mt-30">
                <ul>
                  {playlists.map((pl) => (
                    <PlaylistCard
                      key={pl.id}
                      id={pl.id}
                      name={pl.title}
                      description={pl.description}
                      postsCount={pl.postsCount}
                    />
                  ))}
                </ul>
              </div>
            )}
            <div ref={sentinelRef} style={{ height: 1 }} data-testid="scroll-sentinel" />
            {hasMorePlaylists && !playlistsLoading && playlists.length > 0 && (
              <p className="text-centered">Loading more…</p>
            )}
            {!hasMorePlaylists && !playlistsLoading && playlists.length > 0 && (
              <p className="text-centered">You reached the end!</p>
            )}
          </>
        )}
      </section>
      {isDetailOpen && (
        <PostDetailView postId={selectedPostId!} scrollToComments={scrollToComments} />
      )}
    </>
  );
}
