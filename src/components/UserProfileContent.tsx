import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { enrichWithViewerFavorites } from '../utils/favorites';
import { enrichWithTags } from '../utils/tags';
import { validateExpression } from '../utils/expression-validator';
import type { PostRow } from './PostList';
import { useRouter } from 'next/router';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { PostList } from './PostList';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useTabState } from '../hooks/useTabState';
import { ActivityHeatmap } from './ActivityHeatmap';

// Shared constants
const POST_SELECT_COLUMNS =
  'id,title,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count,is_weekly_winner';

// Shared enrichment pipeline
async function enrichPosts(rows: PostRow[], currentUserId?: string | null): Promise<PostRow[]> {
  if (currentUserId && rows.length > 0) {
    rows = (await enrichWithViewerFavorites(currentUserId, rows)) as PostRow[];
  }
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
        const rows = await enrichPosts((data ?? []) as PostRow[], currentUserId);
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
        .select(POST_SELECT_COLUMNS)
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
        const rows = await enrichPosts((data ?? []) as PostRow[], currentUserId);
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

export function useUserFavorites(
  profileId: string | null,
  currentUserId: string | null,
  enabled: boolean,
) {
  const fetcher = useCallback(async (pid: string) => {
    const { data: favRows, error: favError } = await supabase
      .from('favorites')
      .select('post_id')
      .eq('profile_id', pid);

    if (favError) return { data: null, error: favError };

    const postIds = (favRows ?? []).map((f: any) => f.post_id as string);
    if (postIds.length === 0) return { data: [], error: null };

    return supabase
      .from('posts_with_meta')
      .select(POST_SELECT_COLUMNS)
      .in('id', postIds)
      .eq('is_draft', false)
      .order('created_at', { ascending: false });
  }, []);

  return useLazyPostList(profileId, currentUserId, enabled, fetcher, 'Unable to load favorites.');
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
        .select(POST_SELECT_COLUMNS)
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

  const [activeTab, setActiveTab] = useTabState(tabs, 'posts');

  // Load data based on active tab
  const postsQuery = useUserPosts(profileId, currentUserId);

  const favoritesQuery = useUserFavorites(profileId, currentUserId, activeTab === 'favorites');

  const draftsQuery = useUserDrafts(
    profileId,
    currentUserId,
    activeTab === 'drafts' && isOwnProfile,
  );

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

  const navigateToAnalytics = () => {
    if (isOwnProfile) {
      void router.push('/analytics');
    }
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

      {bio && <p className="profile-bio">{bio}</p>}

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
        <button className='button secondary mb-10' onClick={navigateToAnalytics}>Creator Analytics</button>
      )}

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
          <TabContent
            loading={postsQuery.loading}
            error={postsQuery.error}
            posts={postsQuery.posts}
            emptyMessage="This user has no public posts yet."
            currentUserId={currentUserId}
            extraError={followError}
          />
          <div ref={sentinelRef} style={{ height: 1 }} data-testid="scroll-sentinel" />
          {postsQuery.hasMore && !postsQuery.loading && postsQuery.posts.length > 0 && (
            <p className="text-centered">Loading more…</p>
          )}
          {!postsQuery.hasMore && !postsQuery.loading && postsQuery.posts.length > 0 && (
            <p className="text-centered">You reached the end!</p>
          )}
        </>
      )}

      {activeTab === 'favorites' && (
        <TabContent
          loading={favoritesQuery.loading}
          error={favoritesQuery.error}
          posts={favoritesQuery.posts}
          emptyMessage="This user has no public favorites yet."
          currentUserId={currentUserId}
          loadingMessage="Loading favorites…"
        />
      )}

      {activeTab === 'drafts' && isOwnProfile && (
        <TabContent
          loading={draftsQuery.loading}
          error={draftsQuery.error}
          posts={draftsQuery.posts}
          emptyMessage="You have no drafts yet."
          currentUserId={currentUserId}
          loadingMessage="Loading drafts…"
        />
      )}
    </section>
  );
}
