import { ReactNode, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { supabase } from '../lib/supabaseClient';
import { enrichWithTags } from '../utils/tags';
import { validateExpression } from '../utils/expression-validator';
import type { PostRow } from './PostList';
import { useRouter } from 'next/router';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { PostList } from './PostList';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useTabState } from '../hooks/useTabState';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { ActivityHeatmap } from './ActivityHeatmap';
import { PlaylistCard } from './PlaylistCard';
import { SnippetCodeEditor } from './ExpressionEditor';
import type { SnippetRow } from '../model/snippet';
import { getUserSnippets, createSnippet, deleteSnippet } from '../services/snippetsClient';
import { SNIPPET_DESCRIPTION_MAX, SNIPPET_NAME_MAX } from '../constants';

// Shared enrichment pipeline
async function enrichPosts(rows: PostRow[]): Promise<PostRow[]> {
  if (rows.length > 0) {
    rows = (await enrichWithTags(rows)) as PostRow[];
  }
  return rows.filter((r) => validateExpression(r.expression).valid);
}

// Generic lazy-loading hook for favorites/drafts
type PostFetcher = (profileId: string) => Promise<{ data: any[] | null; error: any }>;

function useLazyPostList(
  profileId: string | null,
  currentUserId: string | null,
  enabled: boolean,
  fetcher: PostFetcher,
  errorMessage: string,
) {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  // Reset when profile changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasLoaded(false);
    setPosts([]);
  }, [profileId]);

  useEffect(() => {
    if (!profileId || !enabled || hasLoaded) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');

      const { data, error: fetchError } = await fetcher(profileId);

      if (cancelled) return;

      if (fetchError) {
        setError(errorMessage);
        setPosts([]);
      } else {
        const rows = await enrichPosts((data ?? []) as PostRow[]);
        setPosts(rows);
        setHasLoaded(true);
      }

      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId, currentUserId, enabled, hasLoaded, fetcher, errorMessage]);

  return { posts, loading, error };
}

// Reusable tab content renderer
interface TabContentProps {
  loading: boolean;
  error: string;
  posts: PostRow[];
  emptyMessage: string;
  currentUserId?: string;
  loadingMessage?: string;
  extraError?: string;
  children?: ReactNode;
}

function TabContent({
  loading,
  error,
  posts,
  emptyMessage,
  currentUserId,
  loadingMessage = 'Loading…',
  extraError,
  children,
}: TabContentProps) {
  if (loading) return <p className="text-centered">{loadingMessage}</p>;
  if (error) return <p className="error-message">{error}</p>;
  if (extraError) return <p className="error-message">{extraError}</p>;
  if (posts.length === 0) return <p className="text-centered">{emptyMessage}</p>;
  return (
    <>
      <PostList posts={posts} currentUserId={currentUserId} />
      {children}
    </>
  );
}

export function useUserPosts(profileId: string | null, currentUserId?: string) {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);

  // Reset when profile changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosts([]);
    setPage(0);
    setHasMore(true);
  }, [profileId]);

  // Fetch posts for current page
  useEffect(() => {
    if (!profileId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    let cancelled = false;
    const pageSize = 20;
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const loadPage = async () => {
      loadingMoreRef.current = true;
      if (page === 0) setLoading(true);
      setError('');

      const { data, error: fetchError } = await supabase
        .from('posts_with_meta')
        .select()
        .eq('profile_id', profileId)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (cancelled) return;

      if (fetchError) {
        setError('Unable to load posts.');
        if (page === 0) setPosts([]);
        setHasMore(false);
      } else {
        const rawLength = (data ?? []).length;
        const rows = await enrichPosts((data ?? []) as PostRow[]);
        setPosts((prev) => (page === 0 ? rows : [...prev, ...rows]));
        // Check raw data length, not enriched length (enrichPosts filters invalid expressions)
        if (rawLength < pageSize) {
          setHasMore(false);
        }
      }

      loadingMoreRef.current = false;
      setLoading(false);
    };

    loadPage();

    return () => {
      cancelled = true;
    };
  }, [profileId, page, currentUserId]);

  return { posts, loading, error, hasMore, loadingMoreRef, setPage };
}

interface PlaylistRow {
  id: string;
  title: string;
  description: string | null;
  posts_count: number;
}

function useUserPlaylists(
  profileId: string | null,
  currentUserId: string | null,
  enabled: boolean,
  isOwnProfile: boolean,
) {
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasLoaded(false);
    setPlaylists([]);
  }, [profileId]);

  useEffect(() => {
    if (!profileId || !enabled || hasLoaded) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');

      let query = supabase
        .from('playlists')
        .select('id, title, description, owner_id')
        .eq('owner_id', profileId)
        .order('updated_at', { ascending: false });

      // If not the owner, only show public playlists
      if (!isOwnProfile) {
        query = query.eq('visibility', 'public');
      }

      const { data, error: fetchError } = await query;

      if (cancelled) return;

      if (fetchError) {
        setError('Unable to load playlists.');
        setPlaylists([]);
      } else {
        // Fetch post counts for each playlist
        const playlistsWithCounts = await Promise.all(
          (data ?? []).map(async (pl) => {
            const { count } = await supabase
              .from('playlist_entries')
              .select('*', { count: 'exact', head: true })
              .eq('playlist_id', pl.id);
            return {
              id: pl.id,
              title: pl.title,
              description: pl.description,
              posts_count: count ?? 0,
            };
          }),
        );
        setPlaylists(playlistsWithCounts);
        setHasLoaded(true);
      }

      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId, enabled, hasLoaded, isOwnProfile]);

  return { playlists, loading, error };
}

export function useUserFavorites(
  profileId: string | null,
  currentUserId: string | null,
  enabled: boolean,
) {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const loadingMoreRef = useRef(false);

  // Reset when profile changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosts([]);
    setPage(0);
    setHasMore(true);
    setError('');
    setLoading(false);
    loadingMoreRef.current = false;
    setIsInitialized(enabled && !!profileId);
  }, [profileId, enabled]);

  // Only start loading once the tab has been activated at least once
  useEffect(() => {
    if (enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsInitialized(true);
    }
  }, [enabled]);

  useEffect(() => {
    if (!profileId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    if (!isInitialized) return;

    let cancelled = false;
    const pageSize = 20;
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const loadFavoritesPage = async () => {
      loadingMoreRef.current = true;
      if (page === 0) setLoading(true);
      setError('');

      const { data: favoriteRows, error: favoritesError } = await supabase
        .from('favorites')
        .select('post_id, created_at')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (cancelled) return;

      if (favoritesError) {
        setError('Unable to load favorites.');
        if (page === 0) setPosts([]);
        setHasMore(false);
        loadingMoreRef.current = false;
        setLoading(false);
        return;
      }

      const favoriteBatch = favoriteRows ?? [];

      if (favoriteBatch.length === 0) {
        if (page === 0) setPosts([]);
        setHasMore(false);
        loadingMoreRef.current = false;
        setLoading(false);
        return;
      }

      const postIds = favoriteBatch.map((row) => row.post_id as string);

      const { data: postsData, error: postsError } = await supabase
        .from('posts_with_meta')
        .select()
        .in('id', postIds)
        .eq('is_draft', false);

      if (cancelled) return;

      if (postsError) {
        setError('Unable to load favorites.');
        if (page === 0) setPosts([]);
        setHasMore(false);
      } else {
        const postsById = new Map((postsData ?? []).map((row) => [row.id, row]));
        const orderedRows = postIds
          .map((id) => postsById.get(id))
          .filter((row): row is PostRow => Boolean(row));
        const enrichedRows = await enrichPosts(orderedRows);

        if (cancelled) return;

        setPosts((prev) => (page === 0 ? enrichedRows : [...prev, ...enrichedRows]));

        if (favoriteBatch.length < pageSize) {
          setHasMore(false);
        }
      }

      loadingMoreRef.current = false;
      setLoading(false);
    };

    void loadFavoritesPage();

    return () => {
      cancelled = true;
    };
  }, [profileId, currentUserId, page, isInitialized]);

  return { posts, loading, error, hasMore, loadingMoreRef, setPage };
}

export function useUserDrafts(
  profileId: string | null,
  currentUserId: string | null,
  enabled: boolean,
) {
  const fetcher = useCallback(
    async (pid: string) =>
      supabase
        .from('posts_with_meta')
        .select()
        .eq('profile_id', pid)
        .eq('is_draft', true)
        .order('created_at', { ascending: false }),
    [],
  );

  // Only enable if currentUserId is present (own profile check)
  return useLazyPostList(
    profileId,
    currentUserId,
    enabled && !!currentUserId,
    fetcher,
    'Unable to load drafts.',
  );
}

function useUserSnippets(
  profileId: string | null,
  enabled: boolean,
) {
  const [snippets, setSnippets] = useState<SnippetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasLoaded(false);
    setSnippets([]);
  }, [profileId]);

  useEffect(() => {
    if (!profileId || !enabled || hasLoaded) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');

      const { data, error: fetchError } = await getUserSnippets(profileId);

      if (cancelled) return;

      if (fetchError) {
        setError('Unable to load snippets.');
        setSnippets([]);
      } else {
        setSnippets(data);
        setHasLoaded(true);
      }

      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId, enabled, hasLoaded]);

  const reload = () => {
    setHasLoaded(false);
  };

  return { snippets, loading, error, reload };
}

export function useProfileDetails(profileId: string | null) {
  const [bio, setBio] = useState<string | null>(null);
  const [socialLinks, setSocialLinks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchDetails = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('bio, social_links')
        .eq('id', profileId)
        .maybeSingle();

      if (cancelled) return;

      setBio(data?.bio ?? null);
      setSocialLinks((data?.social_links as string[]) ?? []);
      setLoading(false);
    };

    void fetchDetails();

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  return { bio, socialLinks, loading };
}

export function useFollowStatus(
  currentUserId: string | undefined,
  viewedProfileId: string | null,
  isOwnProfile: boolean,
) {
  const [isFollowed, setIsFollowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUserId || !viewedProfileId || isOwnProfile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsFollowed(false);
      return;
    }

    let cancelled = false;

    const checkFollow = async () => {
      const { data, error: fetchError } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', currentUserId)
        .eq('followed_id', viewedProfileId)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError) {
        console.warn('Error checking follow state', fetchError.message);
        setIsFollowed(false);
        return;
      }

      setIsFollowed(Boolean(data));
    };

    void checkFollow();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, viewedProfileId, isOwnProfile]);

  const toggleFollow = async () => {
    if (!currentUserId || !viewedProfileId || loading) return;

    setLoading(true);
    setError('');

    if (isFollowed) {
      const { error: unfollowError } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('followed_id', viewedProfileId);

      if (unfollowError) {
        setError('Unable to unfollow user.');
      } else {
        setIsFollowed(false);
      }
    } else {
      const { error: followError } = await supabase.from('follows').insert({
        follower_id: currentUserId,
        followed_id: viewedProfileId,
      });

      if (followError) {
        setError('Unable to follow user.');
      } else {
        setIsFollowed(true);
      }
    }

    setLoading(false);
  };

  return { isFollowed, loading, error, toggleFollow };
}

interface UserProfileContentProps {
  profileId: string | null;
  username: string | null;
  extraHeader?: ReactNode;
  hideFollowButton?: boolean;
}

const tabs = ['posts', 'drafts', 'snippets', 'favorites', 'playlists'] as const;
type TabName = (typeof tabs)[number];

export function UserProfileContent({
  profileId,
  username,
  extraHeader,
  hideFollowButton,
}: UserProfileContentProps) {
  const router = useRouter();
  const { user } = useSupabaseAuth();
  const postsSentinelRef = useRef<HTMLDivElement | null>(null);
  const favoritesSentinelRef = useRef<HTMLDivElement | null>(null);

  const currentUserId = user ? (user as any).id : undefined;
  const isOwnProfile = Boolean(currentUserId && currentUserId === profileId);

  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useTabState(tabs, 'posts');
  const [optimisticTab, setOptimisticTab] = useState<TabName>(activeTab);

  // Load data based on active tab
  const postsQuery = useUserPosts(profileId, currentUserId);

  const favoritesQuery = useUserFavorites(profileId, currentUserId, activeTab === 'favorites');

  const draftsQuery = useUserDrafts(
    profileId,
    currentUserId,
    activeTab === 'drafts' && isOwnProfile,
  );

  const playlistsQuery = useUserPlaylists(
    profileId,
    currentUserId,
    activeTab === 'playlists',
    isOwnProfile,
  );

  const snippetsQuery = useUserSnippets(
    profileId,
    activeTab === 'snippets',
  );

  const [createSnippetModalOpen, setCreateSnippetModalOpen] = useState(false);
  const [newSnippetName, setNewSnippetName] = useState('');
  const [newSnippetCode, setNewSnippetCode] = useState('');
  const [newSnippetDescription, setNewSnippetDescription] = useState('');
  const [newSnippetPublic, setNewSnippetPublic] = useState(false);
  const [snippetSaving, setSnippetSaving] = useState(false);
  const [snippetError, setSnippetError] = useState('');

  const openCreateSnippetModal = () => {
    setNewSnippetName('');
    setNewSnippetCode('');
    setNewSnippetDescription('');
    setNewSnippetPublic(false);
    setSnippetError('');
    setCreateSnippetModalOpen(true);
  };

  const closeCreateSnippetModal = () => {
    setCreateSnippetModalOpen(false);
  };

  const handleCreateSnippet = async () => {
    if (!currentUserId || !newSnippetName.trim() || !newSnippetCode.trim()) return;

    setSnippetSaving(true);
    setSnippetError('');

    const { error } = await createSnippet(
      {
        name: newSnippetName.trim(),
        snippet: newSnippetCode.trim(),
        description: newSnippetDescription.trim(),
        is_public: newSnippetPublic,
      },
      currentUserId,
    );

    setSnippetSaving(false);

    if (error) {
      setSnippetError(error);
    } else {
      setCreateSnippetModalOpen(false);
      snippetsQuery.reload();
    }
  };

  const handleDeleteSnippet = async (snippetId: string) => {
    const { error } = await deleteSnippet(snippetId);
    if (!error) {
      snippetsQuery.reload();
    }
  };

  // Profile details (bio, social links)
  const { bio, socialLinks } = useProfileDetails(profileId);

  // Follow status
  const {
    isFollowed,
    loading: loadingFollow,
    error: followError,
    toggleFollow,
  } = useFollowStatus(currentUserId, profileId, isOwnProfile);

  // Infinite scroll for posts tab
  useInfiniteScroll({
    hasMore: postsQuery.hasMore,
    loadingMoreRef: postsQuery.loadingMoreRef,
    sentinelRef: postsSentinelRef,
    setPage: postsQuery.setPage,
  });

  // Infinite scroll for favorites tab
  useInfiniteScroll({
    hasMore: activeTab === 'favorites' && favoritesQuery.hasMore,
    loadingMoreRef: favoritesQuery.loadingMoreRef,
    sentinelRef: favoritesSentinelRef,
    setPage: favoritesQuery.setPage,
  });

  const handleTabClick = (tab: TabName) => {
    if (tab === activeTab) return;
    // Update optimistic state immediately for instant visual feedback
    setOptimisticTab(tab);
    // Then update actual state in a transition
    startTransition(() => {
      setActiveTab(tab);
    });
  };

  // Get available tabs based on whether this is own profile
  const availableTabs = isOwnProfile ? tabs : tabs.filter((t) => t !== 'drafts' && t !== 'snippets');

  // Handle swipe gestures to switch tabs
  const handleSwipeLeft = () => {
    const currentIndex = (availableTabs as readonly TabName[]).indexOf(activeTab);
    if (currentIndex < availableTabs.length - 1 && currentIndex !== -1) {
      const nextTab = availableTabs[currentIndex + 1];
      setOptimisticTab(nextTab as TabName);
      startTransition(() => {
        setActiveTab(nextTab as TabName);
      });
    }
  };

  const handleSwipeRight = () => {
    const currentIndex = (availableTabs as readonly TabName[]).indexOf(activeTab);
    if (currentIndex > 0) {
      const prevTab = availableTabs[currentIndex - 1];
      setOptimisticTab(prevTab as TabName);
      startTransition(() => {
        setActiveTab(prevTab as TabName);
      });
    }
  };

  const swipeState = useSwipeGesture({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    threshold: 100,
    enabled: true,
  });

  const handleToggleFollow = async () => {
    if (!user) {
      void router.push('/login');
      return;
    }
    await toggleFollow();
  };

  const navigateToAnalytics = () => {
    if (isOwnProfile) {
      void router.push('/analytics');
    }
  };

  const navigateToUserActions = async () => {
    void router.push(`/user-actions/${username}`);
  };

  const navigateToPlaylistCreation = async () => {
    void router.push(`/playlists/new`);
  };

  return (
    <section>
      <div className="profile-title-row">
        <h2>{username ? `@${username}` : 'User'}</h2>
        <div className="profile-title-actions">
          {!hideFollowButton && !isOwnProfile && (
            <>
              <button
                type="button"
                className={isFollowed ? 'button primary' : 'button secondary'}
                disabled={loadingFollow}
                onClick={handleToggleFollow}
              >
                {isFollowed ? 'Followed' : 'Follow'}
              </button>
              <button
                style={{ marginLeft: '10px' }}
                type="button"
                className={'button secondary'}
                disabled={loadingFollow}
                onClick={() => void navigateToUserActions()}
              >
                <span>⁝</span>
              </button>
            </>
          )}
          {extraHeader}
        </div>
      </div>

      {bio && <p className="profile-bio white-space-pre-wrap">{bio}</p>}

      {socialLinks.length > 0 && (
        <div className="profile-social-links">
          {socialLinks.map((url, index) => (
            <a
              key={index}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="profile-social-link"
            >
              {url}
            </a>
          ))}
        </div>
      )}

      {profileId && <ActivityHeatmap userId={profileId} />}

      {isOwnProfile && (
        <button className="button secondary mb-10" onClick={navigateToAnalytics}>
          Creator Analytics
        </button>
      )}

      <div style={{ overflowX: 'hidden' }}>
        <div className="tab-header">
          <span
            className={optimisticTab === 'posts' ? 'tab-button active' : 'tab-button'}
            onClick={() => handleTabClick('posts')}
          >
            Posts
          </span>
          {isOwnProfile && (
            <span
              className={optimisticTab === 'drafts' ? 'tab-button active' : 'tab-button'}
              onClick={() => handleTabClick('drafts')}
            >
              Drafts
            </span>
          )}
          {isOwnProfile && (
            <span
              className={optimisticTab === 'snippets' ? 'tab-button active' : 'tab-button'}
              onClick={() => handleTabClick('snippets')}
            >
              Snippets
            </span>
          )}
          <span
            className={optimisticTab === 'favorites' ? 'tab-button active' : 'tab-button'}
            onClick={() => handleTabClick('favorites')}
          >
            Favorites
          </span>
          <span
            className={optimisticTab === 'playlists' ? 'tab-button active' : 'tab-button'}
            onClick={() => handleTabClick('playlists')}
          >
            Playlists
          </span>
        </div>

        <div
          style={{
            transform: `translateX(${swipeState.translateX}px)`,
            transition: swipeState.isDragging ? 'none' : 'transform 0.3s ease-out',
          }}
        >
          {/* Show loading state when optimistic tab doesn't match actual tab */}
          {optimisticTab !== activeTab && <p className="text-centered">Loading…</p>}

          {/* Only show content when optimistic tab matches actual tab */}
          {optimisticTab === activeTab && activeTab === 'posts' && (
            <>
              <TabContent
                loading={postsQuery.loading}
                error={postsQuery.error}
                posts={postsQuery.posts}
                emptyMessage="This user has no public posts yet."
                currentUserId={currentUserId}
                extraError={followError}
              />
              <div ref={postsSentinelRef} style={{ height: 1 }} data-testid="scroll-sentinel" />
              {postsQuery.hasMore && !postsQuery.loading && postsQuery.posts.length > 0 && (
                <p className="text-centered">Loading more…</p>
              )}
              {!postsQuery.hasMore && !postsQuery.loading && postsQuery.posts.length > 0 && (
                <p className="text-centered">You reached the end!</p>
              )}
            </>
          )}

          {optimisticTab === activeTab && activeTab === 'favorites' && (
            <>
              <TabContent
                loading={favoritesQuery.loading}
                error={favoritesQuery.error}
                posts={favoritesQuery.posts}
                emptyMessage="This user has no public favorites yet."
                currentUserId={currentUserId}
                loadingMessage="Loading favorites…"
              />
              <div
                ref={favoritesSentinelRef}
                style={{ height: 1 }}
                data-testid="favorites-scroll-sentinel"
              />
              {favoritesQuery.hasMore &&
                !favoritesQuery.loading &&
                favoritesQuery.posts.length > 0 && <p className="text-centered">Loading more…</p>}
              {!favoritesQuery.hasMore &&
                !favoritesQuery.loading &&
                favoritesQuery.posts.length > 0 && (
                  <p className="text-centered">You reached the end!</p>
                )}
            </>
          )}

          {optimisticTab === activeTab && activeTab === 'drafts' && isOwnProfile && (
            <TabContent
              loading={draftsQuery.loading}
              error={draftsQuery.error}
              posts={draftsQuery.posts}
              emptyMessage="You have no drafts yet."
              currentUserId={currentUserId}
              loadingMessage="Loading drafts…"
            />
          )}

          {optimisticTab === activeTab && activeTab === 'snippets' && isOwnProfile && (
            <div>
              <button
                type="button"
                className="button primary mb-10 mt-10"
                onClick={openCreateSnippetModal}
              >
                + New snippet
              </button>
              {snippetsQuery.loading && <p className="text-centered">Loading snippets…</p>}
              {snippetsQuery.error && <p className="error-message">{snippetsQuery.error}</p>}
              {!snippetsQuery.loading &&
                !snippetsQuery.error &&
                snippetsQuery.snippets.length === 0 && (
                  <p className="text-centered">You have no snippets yet.</p>
                )}
              {!snippetsQuery.loading &&
                !snippetsQuery.error &&
                snippetsQuery.snippets.length > 0 && (
                  <div className="post-list">
                    {snippetsQuery.snippets.map((s) => (
                      <div key={s.id} className="post-item">
                        <div className="flex-row align-items-center">
                          <strong>{s.name}</strong>
                          <span className="chips">
                            <span className="chip secondary-text smaller" style={{ marginLeft: '8px' }}>
                            {s.is_public ? 'public' : 'private'}
                          </span>
                          </span>
                          <button
                            type="button"
                            className="button secondary ghost small ml-auto"
                            onClick={() => void handleDeleteSnippet(s.id)}
                          >
                            Delete
                          </button>
                        </div>
                        <code className="secondary-text">{s.snippet}</code>
                        {s.description && (
                          <div className="secondary-text smaller">{s.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {optimisticTab === activeTab && activeTab === 'playlists' && (
            <div className="playlists-section">
              {isOwnProfile && (
                <button
                  type="button"
                  className="button primary mb-10 mt-10"
                  onClick={navigateToPlaylistCreation}
                >
                  + New playlist
                </button>
              )}
              {playlistsQuery.loading && <p className="text-centered">Loading playlists…</p>}
              {playlistsQuery.error && <p className="error-message">{playlistsQuery.error}</p>}
              {!playlistsQuery.loading &&
                !playlistsQuery.error &&
                playlistsQuery.playlists.length === 0 && (
                  <p className="text-centered">
                    {isOwnProfile
                      ? 'You have no playlists yet.'
                      : 'This user has no public playlists yet.'}
                  </p>
                )}
              {!playlistsQuery.loading &&
                !playlistsQuery.error &&
                playlistsQuery.playlists.length > 0 && (
                  <ul>
                    {playlistsQuery.playlists.map((pl) => (
                      <PlaylistCard
                        key={pl.id}
                        id={pl.id}
                        name={pl.title}
                        description={pl.description}
                        postsCount={pl.posts_count}
                      />
                    ))}
                  </ul>
                )}
            </div>
          )}
        </div>
      </div>

      {createSnippetModalOpen && (
        <div className="modal-backdrop">
          <div className="modal" onKeyDown={e => { if (e.key === 'Escape') { closeCreateSnippetModal(); } }}>
            <h2>New snippet</h2>
            <label className="field mb-10">
              <input
                type="text"
                className="border-bottom-accent-focus"
                placeholder="Snippet name"
                maxLength={SNIPPET_NAME_MAX}
                value={newSnippetName}
                onChange={(e) => setNewSnippetName(e.target.value)}
                style={{ width: '100%', maxWidth: '100%', padding: '6px 8px' }}
              />
              <div className="secondary-text ml-auto" style={{ fontSize: 12, marginTop: 4 }}>
                {newSnippetName.length}/{SNIPPET_NAME_MAX}
              </div>
            </label>
            <div className="field" style={{ marginBottom: '8px' }}>
              <SnippetCodeEditor
                value={newSnippetCode}
                onChange={setNewSnippetCode}
              />
            </div>
            <label className="field mb-10">
              <textarea
                placeholder="Description (optional)"
                maxLength={SNIPPET_DESCRIPTION_MAX}
                className="border-bottom-accent-focus"
                value={newSnippetDescription}
                onChange={(e) => setNewSnippetDescription(e.target.value)}
                rows={2}
                style={{ width: '100%', padding: '6px 8px', resize: 'vertical' }}
              />
              <div className="secondary-text ml-auto" style={{ fontSize: 12, marginTop: 4 }}>
                {newSnippetDescription.length}/{SNIPPET_DESCRIPTION_MAX}
              </div>
            </label>
            <label className="checkbox" style={{ marginBottom: '12px' }}>
              <input
                type="checkbox"
                checked={newSnippetPublic}
                onChange={(e) => setNewSnippetPublic(e.target.checked)}
              />{' '}
              Make public
            </label>
            {snippetError && <p className="error-message">{snippetError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="button secondary" onClick={closeCreateSnippetModal}>
                Cancel
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => void handleCreateSnippet()}
                disabled={snippetSaving || !newSnippetName.trim() || !newSnippetCode.trim()}
              >
                {snippetSaving ? 'Saving…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
