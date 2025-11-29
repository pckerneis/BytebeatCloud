import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { supabase } from '../lib/supabaseClient';
import { ModeOption, minimizeExpression } from 'shared';

export interface PostRow {
  id: string;
  title: string;
  expression: string;
  is_draft?: boolean;
  sample_rate: string;
  mode: string;
  created_at: string;
  profile_id?: string;
  profiles?: {
    username: string | null;
  } | null;
  favorites_count?: number;
  favorited_by_current_user?: boolean;
}

interface PostListProps {
  posts: PostRow[];
  currentUserId?: string;
}

// Register JavaScript language once for highlight.js
hljs.registerLanguage('javascript', javascript);

function highlightExpression(expr: string): string {
  const minimized = minimizeExpression(expr);
  try {
    return hljs.highlight(minimized, { language: 'javascript' }).value;
  } catch {
    return minimized;
  }
}

export function PostList({ posts, currentUserId }: PostListProps) {
  const { toggle, stop, isPlaying } = useBytebeatPlayer();
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [favoriteState, setFavoriteState] = useState<
    Record<string, { count: number; favorited: boolean }>
  >({});
  const { user } = useSupabaseAuth();
  const router = useRouter();

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  const handleExpressionClick = async (post: PostRow) => {
    // Clicking the active post stops playback
    if (isPlaying && activePostId === post.id) {
      await stop();
      setActivePostId(null);
      return;
    }

    // Ensure any existing playback is fully stopped before starting a new one
    await stop();

    const sr =
      post.sample_rate === '8k' ? 8000 : post.sample_rate === '16k' ? 16000 : 44100;

    const mode: ModeOption = post.mode === 'float' ? ModeOption.Float : ModeOption.Int;

    await toggle(post.expression, mode, sr, true);
    setActivePostId(post.id);
  };

  const handleFavoriteClick = async (post: PostRow) => {
    if (!supabase) return;

    if (!user) {
      await router.push('/login');
      return;
    }

    const userId = (user as any).id as string;
    const current = favoriteState[post.id];
    const baseCount = post.favorites_count ?? 0;
    const currentCount = current ? current.count : baseCount;

    // Try to insert; if unique violation, delete instead.
    const { error } = await supabase
      .from('favorites')
      .insert({ profile_id: userId, post_id: post.id });

    if (!error) {
      // Favorited successfully.
      setFavoriteState((prev) => ({
        ...prev,
        [post.id]: { count: currentCount + 1, favorited: true },
      }));
      return;
    }

    const code = (error as any).code as string | undefined;
    if (code !== '23505') {
      // Non-unique violation error; do not attempt delete.
      // eslint-disable-next-line no-console
      console.warn('Error favoriting post', error.message);
      return;
    }

    // Already favorited -> remove favorite.
    const { error: deleteError } = await supabase
      .from('favorites')
      .delete()
      .eq('profile_id', userId)
      .eq('post_id', post.id);

    if (deleteError) {
      // eslint-disable-next-line no-console
      console.warn('Error removing favorite', deleteError.message);
      return;
    }

    setFavoriteState((prev) => ({
      ...prev,
      [post.id]: { count: Math.max(0, currentCount - 1), favorited: false },
    }));
  };

  return (
    <ul className="post-list">
      {posts.map((post) => {
        const username = post.profiles?.username ?? null;
        const created = new Date(post.created_at).toLocaleDateString();
        const createdTitle = new Date(post.created_at).toLocaleString();
        const isActive = isPlaying && activePostId === post.id;
        const canEdit = Boolean(currentUserId && post.profile_id && post.profile_id === currentUserId);
        const favorite = favoriteState[post.id];
        const favoriteCount = favorite ? favorite.count : post.favorites_count ?? 0;
        const isFavorited =
          favorite?.favorited !== undefined
            ? favorite.favorited
            : !!post.favorited_by_current_user;

        return (
          <li key={post.id} className={`post-item ${isActive ? 'playing' : ''}`}>
            <div className="post-header">
              <div className="post-meta">
                {username ? (
                  <Link href={`/u/${username}`} className="username">
                    @{username}
                  </Link>
                ) : (
                  <span className="username">@unknown</span>
                )}
              </div>
              <h3>{post.title}</h3>
              <div className="chips">
                {post.is_draft && (
                  <span className="chip draft-badge">Draft</span>
                )}
                <span className="chip mode">{post.mode}</span>
                <span className="chip sample-rate">{post.sample_rate}</span>
                <span className="created" title={createdTitle}>{created}</span>
              </div>
            </div>
            <pre
              className="post-expression"
              onClick={() => void handleExpressionClick(post)}
            >
              <code
                className="hljs"
                // highlight.js returns HTML for tokens; highlightExpression wraps
                // the call in a try/catch and falls back to plain text.
                dangerouslySetInnerHTML={{
                  __html: highlightExpression(post.expression),
                }}
              />
            </pre>
            <div className="post-actions">
              <button
                type="button"
                className={`favorite-button ${isFavorited ? ' favorited' : ''}`}
                onClick={() => void handleFavoriteClick(post)}
                aria-label="Favorite"
              >
                <span className="heart">&lt;3</span>
                <span className="favorite-count">{favoriteCount}</span>
              </button>
              {canEdit && (
                <Link href={`/edit/${post.id}`} className="edit-link">
                  Edit
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
