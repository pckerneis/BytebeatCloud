import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { PostList, type PostRow } from '../../components/PostList';

export default function UserPage() {
  const router = useRouter();
  const { username } = router.query;

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Load profile for the given username
  useEffect(() => {
    if (!supabase) return;
    if (!username || typeof username !== 'string') return;

    let cancelled = false;

    const loadProfile = async () => {
      setLoading(true);
      setError('');
      setDisplayName(null);
      setProfileId(null);
      setPosts([]);
      setPage(0);
      setHasMore(true);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id,username')
        .eq('username', username)
        .maybeSingle();

      if (cancelled) return;

      if (profileError) {
        // eslint-disable-next-line no-console
        console.warn('Error loading user profile', profileError.message);
        setError('Unable to load user.');
        setLoading(false);
        return;
      }

      if (!profile) {
        setError('User not found.');
        setLoading(false);
        return;
      }

      setDisplayName(profile.username ?? null);
      setProfileId(profile.id);
      // Posts will be loaded by the pagination effect once profileId is set
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [username]);

  // Paginated load of this user's public posts
  useEffect(() => {
    if (!supabase) return;
    if (!profileId) return;

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

      const { data, error } = await supabase
        .from('posts')
        .select('id,title,expression,is_draft,sample_rate,mode,created_at,profiles(username)')
        .eq('profile_id', profileId)
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
        }
        setHasMore(false);
      } else {
        const rows = data ?? [];
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
  }, [profileId, page]);

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

  return (
    <section>
      <h2>{displayName ? `@${displayName}` : 'User'}</h2>

      {loading && <p>Loading…</p>}
      {!loading && error && <p className="error-message">{error}</p>}

      {!loading && !error && posts.length === 0 && (
        <p>This user has no public posts yet.</p>
      )}

      {!loading && !error && posts.length > 0 && <PostList posts={posts} />}

      <div ref={sentinelRef} style={{ height: 1 }} />
      {hasMore && !loading && posts.length > 0 && (
        <p className="text-centered">Loading more…</p>
      )}

      {!hasMore && !loading && posts.length > 0 && (
        <p className="text-centered">You reached the end!</p>
      )}
    </section>
  );
}
