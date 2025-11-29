import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { ModeOption } from 'shared';

export interface PostRow {
  id: string;
  title: string;
  expression: string;
  is_draft?: boolean;
  sample_rate: string;
  mode: string;
  created_at: string;
  profiles?: {
    username: string | null;
  } | null;
}

interface PostListProps {
  posts: PostRow[];
  showEditLinks?: boolean;
}

export function PostList({ posts, showEditLinks }: PostListProps) {
  const { toggle, stop, isPlaying } = useBytebeatPlayer();
  const [activePostId, setActivePostId] = useState<string | null>(null);

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

  const minimize = (expr: string): string => expr.replace(/\s+/g, ' ');

  return (
    <ul className="post-list">
      {posts.map((post) => {
        const username = post.profiles?.username ?? null;
        const created = new Date(post.created_at).toLocaleDateString();
        const createdTitle = new Date(post.created_at).toLocaleString();
        const isActive = isPlaying && activePostId === post.id;

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
                <span className="created" title={createdTitle}>{created}</span>
              </div>
              <h3>{post.title}</h3>
              <div className="chips">
                {post.is_draft && (
                  <span className="chip draft-badge">Draft</span>
                )}
                <span className="chip mode">{post.mode}</span>
                <span className="chip sample-rate">{post.sample_rate}</span>
              </div>
            </div>
            <pre
              className="post-expression"
              onClick={() => void handleExpressionClick(post)}
            >
              <code>{minimize(post.expression)}</code>
            </pre>
            {showEditLinks && (
              <div className="post-actions">
                <Link href={`/edit/${post.id}`} className="edit-link">
                  Edit
                </Link>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
