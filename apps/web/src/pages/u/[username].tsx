import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { PostList, type PostRow } from '../../components/PostList';

export default function UserPage() {
  const router = useRouter();
  const { username } = router.query;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);

  useEffect(() => {
    if (!supabase) return;
    if (!username || typeof username !== 'string') return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError('');
      setPosts([]);
      setDisplayName(null);

      // Find profile by username
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id,username')
        .eq('username', username)
        .maybeSingle();

      if (cancelled) return;

      if (profileError) {
        // eslint-disable-next-line no-console
        console.warn('Error loading user profile', profileError.message);
        setLoadError('Unable to load user.');
        setLoading(false);
        return;
      }

      if (!profile) {
        setLoadError('User not found.');
        setLoading(false);
        return;
      }

      setDisplayName(profile.username ?? null);

      // Load this user's public (non-draft) posts
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('id,title,expression,is_draft,sample_rate,mode,created_at,profiles(username)')
        .eq('profile_id', profile.id)
        .eq('is_draft', false)
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (postsError) {
        // eslint-disable-next-line no-console
        console.warn('Error loading user posts', postsError.message);
        setLoadError('Unable to load posts.');
        setLoading(false);
        return;
      }

      setPosts(postsData ?? []);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <section>
      <h2>{displayName ? `@${displayName}` : 'User'}</h2>

      {loading && <p>Loading…</p>}
      {!loading && loadError && <p className="error-message">{loadError}</p>}

      {!loading && !loadError && posts.length === 0 && (
        <p>This user has no public posts yet.</p>
      )}

      {!loading && !loadError && posts.length > 0 && <PostList posts={posts} />}
    </section>
  );
}
