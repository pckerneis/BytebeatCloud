import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { PostList, type PostRow } from './PostList';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { enrichWithViewerFavorites } from '../utils/favorites';
import { enrichWithTags } from '../utils/tags';
import { validateExpression } from '../utils/expression-validator';
import { useSyncTabQuery } from '../hooks/useSyncTabQuery';

interface UserProfileContentProps {
  username: string | null;
  extraHeader?: ReactNode;
  hideFollowButton?: boolean;
}

const tabs = ['posts', 'drafts', 'favorites'] as const;
type TabName = (typeof tabs)[number];

export function UserProfileContent({
  username,
  extraHeader,
  hideFollowButton,
}: UserProfileContentProps) {
  const router = useRouter();
  const { user } = useSupabaseAuth();

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [hasLoadedFirstPage, setHasLoadedFirstPage] = useState(false);
  const [activeTab, setActiveTab] = useState<TabName>('posts');
  const [favoritePosts, setFavoritePosts] = useState<PostRow[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [favoritesError, setFavoritesError] = useState('');
  const [draftPosts, setDraftPosts] = useState<PostRow[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftsError, setDraftsError] = useState('');
  const [viewedProfileId, setViewedProfileId] = useState<string | null>(null);
  const [isFollowed, setIsFollowed] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);
  const [followError, setFollowError] = useState('');
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  // Reset pagination when username changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosts([]);
    setPage(0);
    setHasMore(true);
    setHasLoadedFirstPage(false);
  }, [username]);

  useSyncTabQuery(tabs, (tab) => {
    setActiveTab((prev) => (prev !== tab ? tab : prev));
  });

  // Paginated load of this user's public posts by username
  useEffect(() => {
    if (!username) return;

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

      // Look up the profile id for this username to ensure we only load
      // posts that actually belong to this user.
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (cancelled) return;

      if (profileError || !profile) {
        console.warn('Error loading profile for user posts', profileError?.message);
        setError('Unable to load posts.');
        if (page === 0) {
          setPosts([]);
          setHasLoadedFirstPage(true);
        }
        setHasMore(false);
        loadingMoreRef.current = false;
        setLoading(false);
        return;
      }

      setViewedProfileId(profile.id as string);
      if (user && (user as any).id === profile.id) {
        setIsOwnProfile(true);
      } else {
        setIsOwnProfile(false);
      }

      const { data, error } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count',
        )
        .eq('profile_id', profile.id)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (cancelled) return;

      if (error) {
         
        console.warn('Error loading user posts', error.message);
        setError('Unable to load posts.');
        if (page === 0) {
          setPosts([]);
          setHasLoadedFirstPage(true);
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
  }, [username, page, user]);

  useInfiniteScroll({ hasMore, loadingMoreRef, sentinelRef, setPage });

  useEffect(() => {
    if (!user) return;
    if (!viewedProfileId) return;
    if (isOwnProfile) return;

    let cancelled = false;

    const checkFollow = async () => {
      const { data, error } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', (user as any).id)
        .eq('followed_id', viewedProfileId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn('Error checking follow state', error.message);
        setIsFollowed(false);
        return;
      }

      setIsFollowed(Boolean(data));
    };

    void checkFollow();

    return () => {
      cancelled = true;
    };
  }, [user, viewedProfileId, isOwnProfile]);

  const handleToggleFollow = async () => {
    if (!username) return;

    if (!user) {
      void router.push('/login');
      return;
    }

    if (!viewedProfileId) return;

    if (loadingFollow) return;

    setLoadingFollow(true);
    setFollowError('');

    if (isFollowed) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', (user as any).id)
        .eq('followed_id', viewedProfileId);

      if (error) {
        console.warn('Error unfollowing user', error.message);
        setFollowError('Unable to unfollow user.');
      } else {
        setIsFollowed(false);
      }
    } else {
      const { error } = await supabase.from('follows').insert({
        follower_id: (user as any).id,
        followed_id: viewedProfileId,
      });

      if (error) {
        console.warn('Error following user', error.message);
        setFollowError('Unable to follow user.');
      } else {
        setIsFollowed(true);
      }
    }

    setLoadingFollow(false);
  };

  // Load favorites for this user (by username) when the Favorites tab is first activated.
  useEffect(() => {
    if (activeTab !== 'favorites') return;
    if (!username) return;

    let cancelled = false;

    const loadFavorites = async () => {
      setLoadingFavorites(true);
      setFavoritesError('');

      // 1) Look up the profile id for this username.
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (cancelled) return;

      if (profileError || !profile) {
        setFavoritesError('Unable to load favorites.');
        setFavoritePosts([]);
        setLoadingFavorites(false);
        return;
      }

      // 2) Get all favorites for this profile.
      const { data: favRows, error: favError } = await supabase
        .from('favorites')
        .select('post_id')
        .eq('profile_id', profile.id);

      if (cancelled) return;

      if (favError) {
        console.warn('Error loading favorites', favError.message);
        setFavoritesError('Unable to load favorites.');
        setFavoritePosts([]);
        setLoadingFavorites(false);
        return;
      }

      const postIds = (favRows ?? []).map((f: any) => f.post_id as string);
      if (postIds.length === 0) {
        setFavoritePosts([]);
        setLoadingFavorites(false);
        return;
      }

      // 3) Load the corresponding posts with favorites_count.
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
        console.warn('Error loading favorite posts', postsError.message);
        setFavoritesError('Unable to load favorites.');
        setFavoritePosts([]);
      } else {
        let rows = (postsData ?? []) as PostRow[];

        // Mark which of these posts the CURRENT viewer has favorited.
        if (user && rows.length > 0) {
          rows = (await enrichWithViewerFavorites((user as any).id as string, rows)) as PostRow[];
        }

        if (rows.length > 0) {
          rows = (await enrichWithTags(rows)) as PostRow[];
        }

        // Security: drop invalid expressions
        rows = rows.filter((r) => validateExpression(r.expression).valid);
        setFavoritePosts(rows as PostRow[]);
      }

      setLoadingFavorites(false);
    };

    void loadFavorites();

    return () => {
      cancelled = true;
    };
  }, [activeTab, username, user]);

  // Load drafts for this user when the Drafts tab is activated, only on own profile.
  useEffect(() => {
    if (activeTab !== 'drafts') return;
    if (!username) return;
    if (!user) return;

    let cancelled = false;

    const loadDrafts = async () => {
      setLoadingDrafts(true);
      setDraftsError('');

      // Look up the profile id for this username.
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (cancelled) return;

      if (profileError || !profile) {
        setDraftsError('Unable to load drafts.');
        setDraftPosts([]);
        setLoadingDrafts(false);
        return;
      }

      // Load draft posts for this profile with favorites_count.
      const { data: draftData, error: draftError } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count',
        )
        .eq('profile_id', profile.id)
        .eq('is_draft', true)
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (draftError) {
        console.warn('Error loading drafts', draftError.message);
        setDraftsError('Unable to load drafts.');
        setDraftPosts([]);
        setLoadingDrafts(false);
        return;
      } else {
        let rows = (draftData ?? []) as PostRow[];

        // Mark which of these drafts the CURRENT viewer has favorited.
        if (user && rows.length > 0) {
          rows = (await enrichWithViewerFavorites((user as any).id as string, rows)) as PostRow[];
        }

        if (rows.length > 0) {
          rows = (await enrichWithTags(rows)) as PostRow[];
        }

        // Security: drop invalid expressions
        rows = rows.filter((r) => validateExpression(r.expression).valid);
        setDraftPosts(rows as PostRow[]);
        setLoadingDrafts(false);
      }
    };

    void loadDrafts();

    return () => {
      cancelled = true;
    };
  }, [activeTab, username, user]);

  const handleTabClick = (tab: TabName) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    void router.push({ pathname: router.pathname, query: { ...router.query, tab } }, undefined, {
      shallow: true,
    });
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
              onClick={() => void handleToggleFollow()}
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
          {loading && <p className="text-centered">Loading…</p>}
          {!loading && error && <p className="error-message">{error}</p>}
          {!loading && !error && followError && <p className="error-message">{followError}</p>}

          {hasLoadedFirstPage &&
            !loading &&
            !error &&
            page === 0 &&
            !hasMore &&
            posts.length === 0 && (
              <p className="text-centered">This user has no public posts yet.</p>
            )}

          {!loading && !error && posts.length > 0 && (
            <PostList posts={posts} currentUserId={user ? (user as any).id : undefined} />
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
        <>
          {loadingFavorites && <p className="text-centered">Loading favorites…</p>}
          {!loadingFavorites && favoritesError && <p className="error-message">{favoritesError}</p>}
          {!loadingFavorites && !favoritesError && favoritePosts.length === 0 && (
            <p className="text-centered">This user has no public favorites yet.</p>
          )}
          {!loadingFavorites && !favoritesError && favoritePosts.length > 0 && (
            <PostList posts={favoritePosts} currentUserId={user ? (user as any).id : undefined} />
          )}
        </>
      )}

      {activeTab === 'drafts' && isOwnProfile && (
        <>
          {loadingDrafts && <p className="text-centered">Loading drafts…</p>}
          {!loadingDrafts && draftsError && <p className="error-message">{draftsError}</p>}
          {!loadingDrafts && !draftsError && draftPosts.length === 0 && (
            <p className="text-centered">You have no drafts yet.</p>
          )}
          {!loadingDrafts && !draftsError && draftPosts.length > 0 && (
            <PostList posts={draftPosts} currentUserId={user ? (user as any).id : undefined} />
          )}
        </>
      )}
    </section>
  );
}
