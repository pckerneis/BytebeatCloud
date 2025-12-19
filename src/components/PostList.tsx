import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { useCurrentWeeklyChallenge } from '../hooks/useCurrentWeeklyChallenge';
import { favoritePost, unfavoritePost } from '../services/favoritesClient';
import { PostExpressionPlayer } from './PostExpressionPlayer';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { formatSampleRate, ModeOption } from '../model/expression';
import type { LicenseOption } from '../model/postEditor';
import { formatRelativeTime } from '../utils/time';
import { validateExpression } from '../utils/expression-validator';
import { formatPostTitle, formatAuthorUsername, formatPostByAuthor } from '../utils/post-format';

export interface PostRow {
  id: string;
  title: string;
  description?: string | null;
  expression: string;
  is_draft?: boolean;
  sample_rate: number;
  mode: ModeOption;
  created_at: string;
  profile_id?: string;
  author_username?: string | null;
  origin_title?: string | null;
  origin_username?: string | null;
  favorites_count?: number;
  favorited_by_current_user?: boolean;
  fork_of_post_id?: string | null;
  is_fork?: boolean;
  tags?: string[];
  is_weekly_winner?: boolean;
  license?: LicenseOption;
}

interface PostListProps {
  posts: PostRow[];
  currentUserId?: string;
}

function getLengthCategoryChip(expression: string): string | null {
  const len = expression.length;
  if (len < 256) return '<256B';
  if (len < 1024) return '<1KiB';
  return null;
}

export function PostList({ posts, currentUserId }: PostListProps) {
  const { toggle, stop, isPlaying } = useBytebeatPlayer();
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [favoriteState, setFavoriteState] = useState<
    Record<string, { count: number; favorited: boolean }>
  >({});
  const { user } = useSupabaseAuth();
  const router = useRouter();
  const { tag: currentWeekTag } = useCurrentWeeklyChallenge();
  const {
    setPlaylist,
    setCurrentPostById,
    currentPost,
    updateFavoriteStateForPost,
    setCurrentUserId,
    startPlayTracking,
    stopPlayTracking,
  } = usePlayerStore();
  const [favoritePending, setFavoritePending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (currentPost && posts.some((p) => p.id === currentPost.id)) {
      setActivePostId(currentPost.id);
    } else if (!currentPost) {
      setActivePostId(null);
    }
  }, [currentPost, posts]);

  useEffect(() => {
    setCurrentUserId(currentUserId ?? null);
  }, [currentUserId, setCurrentUserId]);

  // Keep the visible row for the currently playing post in sync with
  // the global player store's favorite state (used by the footer).
  useEffect(() => {
    if (!currentPost) return;

    const matchingPost = posts.find((p) => p.id === currentPost.id);
    if (!matchingPost) return;

    setFavoriteState((prev) => {
      const prevEntry = prev[currentPost.id];
      const count =
        currentPost.favorites_count ?? prevEntry?.count ?? matchingPost.favorites_count ?? 0;

      return {
        ...prev,
        [currentPost.id]: {
          count,
          favorited: !!currentPost.favorited_by_current_user,
        },
      };
    });
  }, [currentPost, posts]);

  const handleExpressionClick = async (post: PostRow) => {
    // Clicking the active post stops playback
    if (isPlaying && activePostId === post.id) {
      stopPlayTracking();
      await stop();
      setActivePostId(null);
      setCurrentPostById(null);
      return;
    }

    // Ensure any existing playback is fully stopped before starting a new one
    stopPlayTracking();
    await stop();

    // Security: block playback for invalid expressions
    if (!validateExpression(post.expression).valid) {
      return;
    }

    const sr = post.sample_rate;
    const mode: ModeOption =
      post.mode === 'float'
        ? ModeOption.Float
        : post.mode === 'uint8'
          ? ModeOption.Uint8
          : ModeOption.Int8;

    await toggle(post.expression, mode, sr);
    setActivePostId(post.id);
    setPlaylist(posts, post.id);
    setCurrentPostById(post.id);
    startPlayTracking(post.id);
  };

  const handleFavoriteClick = async (post: PostRow) => {
    if (favoritePending[post.id]) {
      return;
    }

    if (!user) {
      await router.push('/login');
      return;
    }

    const userId = (user as any).id as string;
    const current = favoriteState[post.id];
    const baseCount = post.favorites_count ?? 0;
    const currentCount = current ? current.count : baseCount;
    const isCurrentlyFavorited =
      current?.favorited !== undefined ? current.favorited : !!post.favorited_by_current_user;

    setFavoritePending((prev) => ({ ...prev, [post.id]: true }));

    try {
      if (!isCurrentlyFavorited) {
        const { error } = await favoritePost(userId, post.id);

        if (error) {
          console.warn('Error favoriting post', error.message);
          return;
        }

        const nextCount = currentCount + 1;

        setFavoriteState((prev) => ({
          ...prev,
          [post.id]: { count: nextCount, favorited: true },
        }));

        // Also update the global player store so the footer stays in sync
        // when this post is the one currently being played.
        updateFavoriteStateForPost(post.id, true, nextCount);
      } else {
        const { error: deleteError } = await unfavoritePost(userId, post.id);

        if (deleteError) {
          console.warn('Error removing favorite', deleteError.message);
          return;
        }

        const nextCount = Math.max(0, currentCount - 1);

        setFavoriteState((prev) => ({
          ...prev,
          [post.id]: { count: nextCount, favorited: false },
        }));

        // Mirror the change into the global player store.
        updateFavoriteStateForPost(post.id, false, nextCount);
      }
    } finally {
      setFavoritePending((prev) => ({ ...prev, [post.id]: false }));
    }
  };

  return (
    <ul className="post-list">
      {posts.map((post) => {
        const username = post.author_username ?? null;
        const created = formatRelativeTime(post.created_at);
        const createdTitle = new Date(post.created_at).toLocaleString();
        const isActive = isPlaying && activePostId === post.id;
        const canEdit = Boolean(
          currentUserId && post.profile_id && post.profile_id === currentUserId,
        );
        const favorite = favoriteState[post.id];
        const favoriteCount = favorite ? favorite.count : post.favorites_count ?? 0;
        const isFavorited =
          favorite?.favorited !== undefined ? favorite.favorited : !!post.favorited_by_current_user;
        const isFavoritePending = favoritePending[post.id];
        const lengthCategory = getLengthCategoryChip(post.expression);
        const sortedTags = post.tags?.sort((a, b) => a.localeCompare(b));

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
              <h3>
                <Link className="post-title" href={`/post/${post.id}`}>
                  {formatPostTitle(post.title)}
                </Link>
              </h3>
              {(post.fork_of_post_id || post.is_fork) && (
                <div className="forked-from">
                  {post.origin_title || post.origin_username ? (
                    <Link href={`/post/${post.fork_of_post_id}`} className="fork-link">
                      {`Forked from ${formatPostByAuthor(post.origin_title, post.origin_username)}`}
                    </Link>
                  ) : post.is_fork ? (
                    <span>Forked from (deleted)</span>
                  ) : null}
                </div>
              )}
              <div className="flex-row">
                <div className="chips">
                  {post.is_weekly_winner && (
                    <Link href="/weekly-hall-of-fame" className="chip top-pick-badge">
                      Top Pick
                    </Link>
                  )}
                  {post.is_draft && <span className="chip draft-badge">Draft</span>}
                  <span className="chip mode">{post.mode}</span>
                  <span className="chip sample-rate">{formatSampleRate(post.sample_rate)}</span>
                  {lengthCategory && <span className="chip length-chip">{lengthCategory}</span>}
                  {sortedTags &&
                    sortedTags.length > 0 &&
                    sortedTags.map((tag) => {
                      const isCurrentWeekTag = Boolean(currentWeekTag && tag === currentWeekTag);
                      const href = isCurrentWeekTag ? '/explore?tab=weekly' : `/tags/${tag}`;
                      const className = `chip tag-chip${isCurrentWeekTag ? ' weekly-tag-chip' : ''}`;

                      return (
                        <Link key={tag} href={href} className={className}>
                          #{tag}
                        </Link>
                      );
                    })}
                </div>
                <span className="created" title={createdTitle}>
                  {created}
                </span>
              </div>
            </div>
            <PostExpressionPlayer
              expression={post.expression}
              isActive={isActive}
              onTogglePlay={() => handleExpressionClick(post)}
              disableCopy={post.license === 'all-rights-reserved'}
            />
            <div className="post-actions">
              <button
                type="button"
                className={`favorite-button${isFavorited ? ' favorited' : ''}${
                  isFavoritePending ? ' pending' : ''
                }`}
                onClick={() => void handleFavoriteClick(post)}
                disabled={isFavoritePending}
                aria-label="Favorite"
              >
                <span className="heart">&lt;3</span>
                <span className="favorite-count">{favoriteCount}</span>
              </button>
              {canEdit ? (
                <Link href={`/edit/${post.id}`} className="edit-link">
                  Edit
                </Link>
              ) : post.license === 'all-rights-reserved' ? (
                <span className="edit-link disabled" title="This post is all rights reserved">
                  Fork
                </span>
              ) : (
                <Link href={`/fork/${post.id}`} className="edit-link">
                  Fork
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
