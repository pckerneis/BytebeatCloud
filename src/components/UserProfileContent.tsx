import { ReactNode, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { enrichWithViewerFavorites } from '../utils/favorites';
import { enrichWithTags } from '../utils/tags';
import { validateExpression } from '../utils/expression-validator';
import type { PostRow } from './PostList';
import { useRouter } from 'next/router';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { PostList } from './PostList';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';

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
        .select(
          'id,title,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count',
        )
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
        let rows = (data ?? []) as PostRow[];

        if (currentUserId && rows.length > 0) {
          rows = (await enrichWithViewerFavorites(currentUserId, rows)) as PostRow[];
        }

        if (rows.length > 0) {
          rows = (await enrichWithTags(rows)) as PostRow[];
        }

        rows = rows.filter((r) => validateExpression(r.expression).valid);

        setPosts((prev) => (page === 0 ? rows : [...prev, ...rows]));
        if (rows.length < pageSize) {
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

export function useUserFavorites(
  profileId: string | null,
  currentUserId: string | null,
  enabled: boolean,
) {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!profileId || !enabled) return;
    if (hasLoaded) return; // Only load once

    let cancelled = false;

    const loadFavorites = async () => {
      setLoading(true);
      setError('');

      const { data: favRows, error: favError } = await supabase
        .from('favorites')
        .select('post_id')
        .eq('profile_id', profileId);

      if (cancelled) return;

      if (favError) {
        setError('Unable to load favorites.');
        setPosts([]);
        setLoading(false);
        return;
      }

      const postIds = (favRows ?? []).map((f: any) => f.post_id as string);
      if (postIds.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }

      const { data: postsData, error: postsError } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count',
        )
        .in('id', postIds)
        .eq('is_draft', false)
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (postsError) {
        setError('Unable to load favorites.');
        setPosts([]);
      } else {
        let rows = (postsData ?? []) as PostRow[];

        if (currentUserId && rows.length > 0) {
          rows = (await enrichWithViewerFavorites(currentUserId, rows)) as PostRow[];
        }

        if (rows.length > 0) {
          rows = (await enrichWithTags(rows)) as PostRow[];
        }

        rows = rows.filter((r) => validateExpression(r.expression).valid);
        setPosts(rows);
      }

      setLoading(false);
    };

    void loadFavorites();

    return () => {
      cancelled = true;
    };
  }, [profileId, currentUserId, enabled, hasLoaded]);

  // Reset when profile changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasLoaded(false);
    setPosts([]);
  }, [profileId]);

  return { posts, loading, error };
}

export function useUserDrafts(profileId: string | null, currentUserId: string, enabled: boolean) {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!profileId || !currentUserId || !enabled) return;
    if (hasLoaded) return; // Only load once

    let cancelled = false;

    const loadDrafts = async () => {
      setLoading(true);
      setError('');

      const { data, error: draftError } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count',
        )
        .eq('profile_id', profileId)
        .eq('is_draft', true)
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (draftError) {
        setError('Unable to load drafts.');
        setPosts([]);
      } else {
        let rows = (data ?? []) as PostRow[];

        if (currentUserId && rows.length > 0) {
          rows = (await enrichWithViewerFavorites(currentUserId, rows)) as PostRow[];
        }

        if (rows.length > 0) {
          rows = (await enrichWithTags(rows)) as PostRow[];
        }

        rows = rows.filter((r) => validateExpression(r.expression).valid);
        setPosts(rows);
      }

      setLoading(false);
    };

    void loadDrafts();

    return () => {
      cancelled = true;
    };
  }, [profileId, currentUserId, enabled, hasLoaded]);

  // Reset when profile changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasLoaded(false);
    setPosts([]);
  }, [profileId]);

  return { posts, loading, error };
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

const tabs = ['posts', 'drafts', 'favorites'] as const;
type TabName = (typeof tabs)[number];

export function UserProfileContent({
 profileId,
 username,
  extraHeader,
  hideFollowButton,
}: UserProfileContentProps) {
  const router = useRouter();
  const { user } = useSupabaseAuth();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const currentUserId = user ? (user as any).id : undefined;
  const isOwnProfile = Boolean(currentUserId && currentUserId === profileId);

  // Get active tab from URL on initial load, then manage in state
  const [activeTab, setActiveTabState] = useState<TabName>(() => {
    const tabParam = router.query.tab as string;
    return tabs.includes(tabParam as TabName) ? (tabParam as TabName) : 'posts';
  });

  // Sync with URL on mount only
  useEffect(() => {
    const tabParam = router.query.tab as string;
    if (tabs.includes(tabParam as TabName)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTabState(tabParam as TabName);
    }
  }, [router.query.tab]); // Only on mount

  const setActiveTab = (tab: TabName) => {
    setActiveTabState(tab);
    // Update URL without navigation
    void router.push(
      { pathname: router.pathname, query: { ...router.query, tab } },
      undefined,
      { shallow: true }
    );
  };

  // Load data based on active tab
  const postsQuery = useUserPosts(profileId, currentUserId);

  const favoritesQuery = useUserFavorites(
    profileId,
    currentUserId,
    activeTab === 'favorites',
  );

  const draftsQuery = useUserDrafts(
    profileId,
    currentUserId,
    activeTab === 'drafts' && isOwnProfile,
  );

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
    sentinelRef,
    setPage: postsQuery.setPage,
  });

  const handleTabClick = (tab: TabName) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
  };

  const handleToggleFollow = async () => {
    if (!user) {
      void router.push('/login');
      return;
    }
    await toggleFollow();
  };

  return (
    <section>
      <div className="profile-title-row">
        <h2>{username ? `@${username}` : 'User'}</h2>
        <div className="profile-title-actions">
          {!hideFollowButton && !isOwnProfile && (
            <button
              type="button"
              className={isFollowed ? 'button primary' : 'button secondary'}
              disabled={loadingFollow}
              onClick={handleToggleFollow}
            >
              {isFollowed ? 'Followed' : 'Follow'}
            </button>
          )}
          {extraHeader}
        </div>
      </div>

      <div className="tab-header">
        <span
          className={activeTab === 'posts' ? 'tab-button active' : 'tab-button'}
          onClick={() => handleTabClick('posts')}
        >
          Posts
        </span>
        {isOwnProfile && (
          <span
            className={activeTab === 'drafts' ? 'tab-button active' : 'tab-button'}
            onClick={() => handleTabClick('drafts')}
          >
            Drafts
          </span>
        )}
        <span
          className={activeTab === 'favorites' ? 'tab-button active' : 'tab-button'}
          onClick={() => handleTabClick('favorites')}
        >
          Favorites
        </span>
      </div>

      {activeTab === 'posts' && (
        <>
          {postsQuery.loading && <p className="text-centered">Loading…</p>}
          {!postsQuery.loading && postsQuery.error && (
            <p className="error-message">{postsQuery.error}</p>
          )}
          {!postsQuery.loading && followError && <p className="error-message">{followError}</p>}

          {!postsQuery.loading && !postsQuery.error && postsQuery.posts.length === 0 && (
            <p className="text-centered">This user has no public posts yet.</p>
          )}

          {!postsQuery.loading && postsQuery.posts.length > 0 && (
            <PostList posts={postsQuery.posts} currentUserId={currentUserId} />
          )}

          <div ref={sentinelRef} style={{ height: 1 }} />
          {postsQuery.hasMore && !postsQuery.loading && postsQuery.posts.length > 0 && (
            <p className="text-centered">Loading more…</p>
          )}

          {!postsQuery.hasMore && !postsQuery.loading && postsQuery.posts.length > 0 && (
            <p className="text-centered">You reached the end!</p>
          )}
        </>
      )}

      {activeTab === 'favorites' && (
        <>
          {favoritesQuery.loading && <p className="text-centered">Loading favorites…</p>}
          {!favoritesQuery.loading && favoritesQuery.error && (
            <p className="error-message">{favoritesQuery.error}</p>
          )}
          {!favoritesQuery.loading && favoritesQuery.posts.length === 0 && (
            <p className="text-centered">This user has no public favorites yet.</p>
          )}
          {!favoritesQuery.loading && favoritesQuery.posts.length > 0 && (
            <PostList posts={favoritesQuery.posts} currentUserId={currentUserId} />
          )}
        </>
      )}

      {activeTab === 'drafts' && isOwnProfile && (
        <>
          {draftsQuery.loading && <p className="text-centered">Loading drafts…</p>}
          {!draftsQuery.loading && draftsQuery.error && (
            <p className="error-message">{draftsQuery.error}</p>
          )}
          {!draftsQuery.loading && draftsQuery.posts.length === 0 && (
            <p className="text-centered">You have no drafts yet.</p>
          )}
          {!draftsQuery.loading && draftsQuery.posts.length > 0 && (
            <PostList posts={draftsQuery.posts} currentUserId={currentUserId} />
          )}
        </>
      )}
    </section>
  );
}
