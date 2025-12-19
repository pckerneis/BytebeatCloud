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
  comments_count?: number;
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
        const commentsCount = post.comments_count ?? 0;
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
                <svg className="heart-icon" width="64" height="64" viewBox="0 0 64 64" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M31.9823 58.7827L5.69823 32.4986C3.60164 30.402 2.20391 27.9645 1.50505 25.1861C0.823232 22.4077 0.831755 19.6463 1.53062 16.902C2.22948 14.1406 3.61869 11.7372 5.69823 9.69176C7.82891 7.59517 10.2579 6.20596 12.9852 5.52415C15.7295 4.82528 18.4653 4.82528 21.1926 5.52415C23.9369 6.22301 26.3744 7.61222 28.5051 9.69176L31.9823 13.0668L35.4596 9.69176C37.6073 7.61222 40.0448 6.22301 42.7721 5.52415C45.4994 4.82528 48.2266 4.82528 50.9539 5.52415C53.6982 6.20596 56.1357 7.59517 58.2664 9.69176C60.346 11.7372 61.7352 14.1406 62.434 16.902C63.1329 19.6463 63.1329 22.4077 62.434 25.1861C61.7522 27.9645 60.363 30.402 58.2664 32.4986L31.9823 58.7827Z" />
                </svg>
                <span className="favorite-count">{favoriteCount}</span>
              </button>
              <Link
                href={`/post/${post.id}#comments`}
                className="comments-button"
                aria-label="Comments"
              >
                <svg className="comment-icon" width="64" height="64" viewBox="0 0 64 64" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M53 10C57.9706 10 62 14.0294 62 19V39.8232C61.9999 44.7937 57.9773 48.8232 53.0068 48.8232C43.7145 48.8232 30.2547 48.8232 28 48.8232C24.5 48.8232 9.00001 61.764 12 56.9111C15 52.0583 13.5 48.8232 11 48.8232C6.02952 48.8232 2.00013 44.7937 2 39.8232V19C2 14.0294 6.02944 10 11 10H53ZM17 25C14.2386 25 12 27.2386 12 30C12 32.7614 14.2386 35 17 35C19.7614 35 22 32.7614 22 30C22 27.2386 19.7614 25 17 25ZM32 25C29.2386 25 27 27.2386 27 30C27 32.7614 29.2386 35 32 35C34.7614 35 37 32.7614 37 30C37 27.2386 34.7614 25 32 25ZM47 25C44.2386 25 42 27.2386 42 30C42 32.7614 44.2386 35 47 35C49.7614 35 52 32.7614 52 30C52 27.2386 49.7614 25 47 25Z" />
                </svg>
                <span className="comments-count">{commentsCount}</span>
              </Link>
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
