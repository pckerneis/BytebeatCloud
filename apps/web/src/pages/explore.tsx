import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { ModeOption } from 'shared';

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

  const { toggle, stop, isPlaying } = useBytebeatPlayer();
  const [activePostId, setActivePostId] = useState<string | null>(null);

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

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  const handleExpressionClick = async (post: PostRow) => {
    if (isPlaying && activePostId === post.id) {
      await stop();
      setActivePostId(null);
      return;
    }

    if (isPlaying && activePostId && activePostId !== post.id) {
      await stop();
    }

    const sr =
      post.sample_rate === '8k' ? 8000 : post.sample_rate === '16k' ? 16000 : 44100;

    const mode: ModeOption = post.mode === 'float' ? ModeOption.Float : ModeOption.Int;

    await toggle(post.expression, mode, sr, true);
    setActivePostId(post.id);
  };

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
            const created = new Date(post.created_at).toLocaleDateString();
            const createdTitle = new Date(post.created_at).toLocaleString();
            const isActive = isPlaying && activePostId === post.id;

            return (
              <li key={post.id} className={`post-item ${isActive ? 'playing' : ''}`}>
                <div className="post-header">
                  <div className="post-meta">
                    <span className="username">@{username}</span>
                    <span className="created" title={createdTitle}>{created}</span>
                  </div>
                  <h3>
                    {post.title}
                  </h3>
                  <div className="chips">
                    <span className="chip mode">{post.mode}</span>
                    <span className="chip sample-rate">{post.sample_rate}</span>
                  </div>
                </div>
                <pre
                  className="post-expression"
                  onClick={() => void handleExpressionClick(post)}
                >
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
