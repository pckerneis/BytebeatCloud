import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface PostRow {
  id: string;
  title: string;
  expression: string;
  is_draft: boolean;
  sample_rate: string;
  mode: string;
  created_at: string;
  profiles?: {
    username: string | null;
  } | null;
}

export default function ExplorePage() {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError('Supabase client is not configured.');
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');

      const { data, error } = await supabase
        .from('posts')
        .select('id,title,expression,sample_rate,mode,created_at,profiles(username)')
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .limit(20);

      if (cancelled) return;

      if (error) {
        setError(error.message);
        setPosts([]);
      } else {
        setPosts(data ?? []);
      }

      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <h2>Explore</h2>
      {loading && <p>Loading posts…</p>}
      {error && !loading && <p className="error-message">{error}</p>}
      {!loading && !error && posts.length === 0 && (
        <p>No posts yet. Create something on the Create page!</p>
      )}
      {!loading && !error && posts.length > 0 && (
        <ul className="post-list">
          {posts.map((post) => {
            const username = post.profiles?.username ?? 'unknown';
            const created = new Date(post.created_at).toLocaleString();

            return (
              <li key={post.id} className="post-item">
                <div className="post-header">
                  <h3>{post.title}</h3>
                  <span className="post-meta">
                    @{username} · {post.mode} · {post.sample_rate} ·{' '}
                    {post.is_draft ? 'Draft' : 'Published'} · {created}
                  </span>
                </div>
                <pre className="post-expression">
                  <code>{post.expression}</code>
                </pre>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
