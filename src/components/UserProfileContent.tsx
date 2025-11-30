import { useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { PostList, type PostRow } from './PostList';

interface UserProfileContentProps {
  username: string | null;
  extraHeader?: ReactNode;
}

export function UserProfileContent({ username, extraHeader }: UserProfileContentProps) {
  const { user } = useSupabaseAuth();

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [hasLoadedFirstPage, setHasLoadedFirstPage] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'drafts' | 'favorites'>('posts');
  const [favoritePosts, setFavoritePosts] = useState<PostRow[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [favoritesError, setFavoritesError] = useState('');
  const [draftPosts, setDraftPosts] = useState<PostRow[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftsError, setDraftsError] = useState('');
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
        // eslint-disable-next-line no-console
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

      const { data, error } = await supabase
        .from('posts')
        .select(
          'id,title,expression,is_draft,sample_rate,mode,created_at,profile_id,profiles(username),favorites(count)',
        )
        .eq('profile_id', profile.id)
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
  }, [username, page, user]);

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

  const isOwnProfile = Boolean(user && posts.some((p) => p.profile_id === (user as any).id));

  // Load favorites for this user (by username) when the Favorites tab is first activated.
  useEffect(() => {
    if (activeTab !== 'favorites') return;
    if (!supabase) return;
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
        // eslint-disable-next-line no-console
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
        .from('posts')
        .select(
          'id,title,expression,is_draft,sample_rate,mode,created_at,profile_id,profiles(username),favorites(count)',
        )
        .in('id', postIds)
        .eq('is_draft', false)
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (postsError) {
        // eslint-disable-next-line no-console
        console.warn('Error loading favorite posts', postsError.message);
        setFavoritesError('Unable to load favorites.');
        setFavoritePosts([]);
      } else {
        let rows = (postsData ?? []).map((row: any) => ({
          ...row,
          favorites_count: row.favorites?.[0]?.count ?? 0,
        }));

        // Mark which of these posts the CURRENT viewer has favorited.
        if (user && rows.length > 0) {
          const viewerId = (user as any).id as string;
          const favPostIds = rows.map((r: any) => r.id);
          const { data: viewerFavs, error: viewerFavError } = await supabase
            .from('favorites')
            .select('post_id')
            .eq('profile_id', viewerId)
            .in('post_id', favPostIds);

          if (!viewerFavError && viewerFavs) {
            const favoritedSet = new Set((viewerFavs as any[]).map((f) => f.post_id as string));
            rows = rows.map((r: any) => ({
              ...r,
              favorited_by_current_user: favoritedSet.has(r.id),
            }));
          }
        }

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
    if (!supabase) return;
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
        .from('posts')
        .select(
          'id,title,expression,is_draft,sample_rate,mode,created_at,profile_id,profiles(username),favorites(count)',
        )
        .eq('profile_id', profile.id)
        .eq('is_draft', true)
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (draftError) {
        // eslint-disable-next-line no-console
        console.warn('Error loading drafts', draftError.message);
        setDraftsError('Unable to load drafts.');
        setDraftPosts([]);
        setLoadingDrafts(false);
        return;
      }

      let rows = (draftData ?? []).map((row: any) => ({
        ...row,
        favorites_count: row.favorites?.[0]?.count ?? 0,
      }));

      // Mark which of these drafts the CURRENT viewer has favorited.
      if (user && rows.length > 0) {
        const viewerId = (user as any).id as string;
        const draftIds = rows.map((r: any) => r.id);
        const { data: viewerFavs, error: viewerFavError } = await supabase
          .from('favorites')
          .select('post_id')
          .eq('profile_id', viewerId)
          .in('post_id', draftIds);

        if (!viewerFavError && viewerFavs) {
          const favoritedSet = new Set((viewerFavs as any[]).map((f) => f.post_id as string));
          rows = rows.map((r: any) => ({
            ...r,
            favorited_by_current_user: favoritedSet.has(r.id),
          }));
        }
      }

      setDraftPosts(rows as PostRow[]);
      setLoadingDrafts(false);
    };

    void loadDrafts();

    return () => {
      cancelled = true;
    };
  }, [activeTab, username, user]);

  return (
    <section>
      <div className="profile-title-row">
        <h2>{username ? `@${username}` : 'User'}</h2>
        {extraHeader}
      </div>

      <div className="tab-header">
        <span
          className={activeTab === 'posts' ? 'tab-button active' : 'tab-button'}
          onClick={() => setActiveTab('posts')}
        >
          Posts
        </span>
        {isOwnProfile && (
          <span
            className={activeTab === 'drafts' ? 'tab-button active' : 'tab-button'}
            onClick={() => setActiveTab('drafts')}
          >
            Drafts
          </span>
        )}
        <span
          className={activeTab === 'favorites' ? 'tab-button active' : 'tab-button'}
          onClick={() => setActiveTab('favorites')}
        >
          Favorites
        </span>
      </div>

      {activeTab === 'posts' && (
        <>
          {loading && <p className="text-centered">Loading…</p>}
          {!loading && error && <p className="error-message">{error}</p>}

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
