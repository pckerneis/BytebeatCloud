import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { ExportWavModal } from './ExportWavModal';
import { ModeOption } from '../model/expression';
import { LICENSE_OPTIONS } from '../model/postEditor';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { useCurrentUserProfile } from '../hooks/useCurrentUserProfile';
import { PostList, type PostRow } from './PostList';
import { PostLineage } from './PostLineage';
import Link from 'next/link';
import { enrichWithTags } from '../utils/tags';
import { validateExpression } from '../utils/expression-validator';
import { useCurrentWeeklyChallenge } from '../hooks/useCurrentWeeklyChallenge';
import {
  renderDescriptionWithTagsAndMentions,
  extractMentionUserIds,
  extractPostIds,
  type PostInfo,
} from '../utils/description-renderer';
import { formatPostTitle, formatAuthorUsername } from '../utils/post-format';
import { COMMENT_MAX } from '../constants';
import { AutocompleteTextarea } from './AutocompleteTextarea';
import { convertMentionsToIds } from '../utils/mentions';
import { formatRelativeTime } from '../utils/time';
import { PlaylistCard } from './PlaylistCard';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  author_username: string | null;
}

interface Playlist {
  id: string;
  name: string;
  description: string;
  created_at: string;
  author_id: string;
  author_username: string | null;
  postsCount?: number;
}

interface PostDetailViewProps {
  postId: string;
  baseUrl?: string;
  onBack?: () => void;
}

export function PostDetailView({ postId, baseUrl, onBack }: Readonly<PostDetailViewProps>) {
  const router = useRouter();

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mentionUserMap, setMentionUserMap] = useState<Map<string, string>>(new Map());
  const [postMap, setPostMap] = useState<Map<string, PostInfo>>(new Map());
  const [showExportModal, setShowExportModal] = useState(false);
  const [shareButtonText, setShareButtonText] = useState('Share');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [hasReported, setHasReported] = useState(false);
  const [reportPending, setReportPending] = useState(false);
  const [reportError, setReportError] = useState('');
  const [activeTab, setActiveTab] = useState<'comments' | 'playlists' | 'lineage'>('comments');

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentPending, setCommentPending] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [commentMentionUserMap, setCommentMentionUserMap] = useState<Map<string, string>>(
    new Map(),
  );
  const [commentPostMap, setCommentPostMap] = useState<Map<string, PostInfo>>(new Map());
  const [reportedCommentIds, setReportedCommentIds] = useState<Set<string>>(new Set());
  const [commentReportOpen, setCommentReportOpen] = useState<string | null>(null);
  const [commentReportCategory, setCommentReportCategory] = useState('');
  const [commentReportDetails, setCommentReportDetails] = useState('');
  const [commentReportPending, setCommentReportPending] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<string | null>(null);
  const [deleteConfirmAuthorId, setDeleteConfirmAuthorId] = useState<string | null>(null);
  const [deleteAlsoReport, setDeleteAlsoReport] = useState(false);
  const [deleteReportCategory, setDeleteReportCategory] = useState('');
  const [deletePending, setDeletePending] = useState(false);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [addToPlaylistOpen, setAddToPlaylistOpen] = useState(false);
  const [addToPlaylistPending, setAddToPlaylistPending] = useState(false);
  const [addToPlaylistError, setAddToPlaylistError] = useState<string>('');

  // Playlists that include this post (for the tab display)
  const [postPlaylists, setPostPlaylists] = useState<Playlist[]>([]);
  const [postPlaylistsLoading, setPostPlaylistsLoading] = useState(false);

  const { weekNumber: currentWeekNumber, theme: currentWeekTheme } = useCurrentWeeklyChallenge();

  const { user } = useSupabaseAuth();
  const { username: currentUsername } = useCurrentUserProfile();

  const currentUserId = useMemo(() => (user ? (user as any).id : null), [user]);
  const postPlaylistIdSet = useMemo(() => new Set(postPlaylists.map((p) => p.id)), [postPlaylists]);

  const handleReportPost = () => {
    if (!user) {
      void router.push('/login');
      return;
    }
    if (hasReported || posts.length === 0) return;
    setReportCategory('');
    setReportDetails('');
    setReportError('');
    setReportOpen(true);
  };

  const openAddToPlaylist = async () => {
    if (!user) {
      void router.push('/login');
      return;
    }
    setAddToPlaylistError('');
    setAddToPlaylistOpen(true);
    setPlaylists([]);
    setPlaylistsLoading(true);
    const { data, error } = await supabase
      .from('playlists')
      .select('id, title, description, created_at, owner_id:owner_id')
      .eq('owner_id', (user as any).id)
      .order('updated_at', { ascending: false });
    if (error) {
      console.warn('Error loading playlists', error.message);
      setPlaylists([]);
    } else {
      const rows = (data ?? []).map((p: any) => ({
        id: p.id as string,
        name: p.title as string,
        description: (p.description as string) ?? '',
        created_at: p.created_at as string,
        author_id: p.owner_id as string,
        author_username: currentUsername ?? null,
      }));
      setPlaylists(rows);
    }
    setPlaylistsLoading(false);
  };

  const handleAppendToPlaylist = async (playlistId: string) => {
    if (!user || posts.length === 0) return;
    setAddToPlaylistPending(true);
    setAddToPlaylistError('');
    try {
      const { data: posRow, error: posErr } = await supabase
        .from('playlist_entries')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (posErr) throw posErr;
      const nextPos = (posRow?.position ?? 0) + 1;

      const { error: insertErr } = await supabase.from('playlist_entries').insert({
        playlist_id: playlistId,
        post_id: posts[0].id,
        position: nextPos,
      });
      if (insertErr) throw insertErr;
      setAddToPlaylistOpen(false);
      // Refresh playlists containing this post so the tab count updates
      try {
        setPostPlaylistsLoading(true);
        const { data: entries, error: entErr } = await supabase
          .from('playlist_entries')
          .select('playlist_id')
          .eq('post_id', posts[0].id);
        if (entErr) throw entErr;
        const ids = Array.from(new Set((entries ?? []).map((e: any) => e.playlist_id)));
        if (ids.length === 0) {
          setPostPlaylists([]);
        } else {
          const { data: pls } = await supabase
            .from('playlists')
            .select(
              'id, title, description, created_at, owner:profiles!playlists_owner_id_fkey(username), entries:playlist_entries(count)',
            )
            .in('id', ids)
            .order('updated_at', { ascending: false });
          const rows: Playlist[] = (pls ?? []).map((p: any) => ({
            id: p.id as string,
            name: p.title as string,
            description: (p.description as string) ?? '',
            created_at: p.created_at as string,
            author_id: '',
            author_username: (p.owner?.username as string) ?? null,
            postsCount: (p.entries?.[0]?.count as number) ?? 0,
          }));
          setPostPlaylists(rows);
        }
      } catch (_refreshErr) {
        // Best-effort; ignore
      } finally {
        setPostPlaylistsLoading(false);
      }
    } catch (e: any) {
      console.warn('Failed to append to playlist', e?.message || e);
      setAddToPlaylistError('Failed to add to playlist. Please try again.');
    } finally {
      setAddToPlaylistPending(false);
    }
  };

  const closeReport = () => setReportOpen(false);

  const submitReport = async () => {
    if (!user || posts.length === 0 || !reportCategory) return;
    if (reportCategory === 'Other' && !reportDetails.trim()) return;
    setReportPending(true);
    setReportError('');
    try {
      const { error: reportErr } = await supabase.from('post_reports').insert({
        reporter_id: (user as any).id,
        post_id: posts[0].id,
        reason: reportCategory,
        details: reportDetails.trim() || null,
      });

      if (reportErr) {
        if ((reportErr as any).code === '23505') {
          setHasReported(true);
          setReportOpen(false);
          return;
        }
        throw reportErr;
      }

      setHasReported(true);
      setReportOpen(false);
    } catch (e) {
      setReportError('Failed to submit report. Please try again.');
    } finally {
      setReportPending(false);
    }
  };

  const handleShare = async () => {
    const effectiveBaseUrl =
      baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    const shareUrl = `${effectiveBaseUrl}/post/${postId}`;
    const shareTitle = posts[0]?.title || 'Check out this bytebeat';

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or share failed silently
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareButtonText('Link copied!');
        setTimeout(() => setShareButtonText('Share'), 2000);
      } catch (err) {
        console.error('Failed to copy link', err);
      }
    }
  };

  useEffect(() => {
    if (!postId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      setPosts([]);

      const { data, error } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,description,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count,is_weekly_winner,license,comments_count',
        )
        .eq('id', postId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn('Error loading post', error.message);
        setError('Unable to load post.');
        setLoading(false);
        return;
      }

      if (!data) {
        setError('Post not found.');
        setLoading(false);
        return;
      }

      let rowWithCount = data as PostRow;

      if (user) {
        const { data: favs, error: favError } = await supabase
          .from('favorites')
          .select('post_id')
          .eq('profile_id', (user as any).id)
          .eq('post_id', rowWithCount.id);

        if (!favError && favs && favs.length > 0) {
          rowWithCount = {
            ...rowWithCount,
            favorited_by_current_user: true,
          };
        }
      }

      if (!validateExpression(rowWithCount.expression).valid) {
        setError('This post contains an invalid expression.');
        setLoading(false);
        return;
      }

      [rowWithCount] = (await enrichWithTags([rowWithCount])) as PostRow[];

      if (user) {
        const { data: reportRow } = await supabase
          .from('post_reports')
          .select('id')
          .eq('reporter_id', (user as any).id)
          .eq('post_id', rowWithCount.id)
          .maybeSingle();
        if (!cancelled) setHasReported(!!reportRow);
      }

      const mentionUserIds = extractMentionUserIds(rowWithCount.description ?? '');
      if (mentionUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', mentionUserIds);

        if (profiles) {
          const userMap = new Map<string, string>();
          for (const p of profiles) {
            userMap.set(p.id, p.username);
          }
          setMentionUserMap(userMap);
        }
      }

      const postIds = extractPostIds(rowWithCount.description ?? '');
      if (postIds.length > 0) {
        const { data: linkedPosts } = await supabase
          .from('posts')
          .select('id, title, author:profiles!posts_profile_id_fkey(username)')
          .in('id', postIds);

        if (linkedPosts) {
          const pMap = new Map<string, PostInfo>();
          for (const p of linkedPosts) {
            pMap.set(p.id, {
              title: formatPostTitle(p.title),
              authorUsername: formatAuthorUsername((p.author as any)?.username),
            });
          }
          setPostMap(pMap);
        }
      }

      setPosts([rowWithCount]);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [postId, user]);

  useEffect(() => {
    if (!postId || posts.length === 0) return;
    if (activeTab !== 'comments') return;

    let cancelled = false;

    const loadComments = async () => {
      setCommentsLoading(true);
      const { data, error } = await supabase
        .from('comments')
        .select(
          'id, content, created_at, author_id, author:profiles!comments_author_id_fkey(username)',
        )
        .eq('post_id', postId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.warn('Error loading comments', error.message);
        setComments([]);
      } else {
        const rows = (data ?? []).map((c: any) => ({
          id: c.id as string,
          content: c.content as string,
          created_at: c.created_at as string,
          author_id: c.author_id as string,
          author_username: (c.author?.username as string) ?? null,
        }));
        setComments(rows);

        const allMentionIds = new Set<string>();
        for (const c of rows) {
          for (const uid of extractMentionUserIds(c.content)) {
            allMentionIds.add(uid);
          }
        }
        if (allMentionIds.size > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', [...allMentionIds]);
          if (profiles && !cancelled) {
            const userMap = new Map<string, string>();
            for (const p of profiles) {
              userMap.set(p.id, p.username);
            }
            setCommentMentionUserMap(userMap);
          }
        } else {
          setCommentMentionUserMap(new Map());
        }

        const allPostIds = new Set<string>();
        for (const c of rows) {
          for (const pid of extractPostIds(c.content)) {
            allPostIds.add(pid);
          }
        }
        if (allPostIds.size > 0) {
          const { data: linkedPosts } = await supabase
            .from('posts')
            .select('id, title, author:profiles!posts_profile_id_fkey(username)')
            .in('id', [...allPostIds]);
          if (linkedPosts && !cancelled) {
            const pMap = new Map<string, PostInfo>();
            for (const p of linkedPosts) {
              pMap.set(p.id, {
                title: formatPostTitle(p.title),
                authorUsername: formatAuthorUsername((p.author as any)?.username),
              });
            }
            setCommentPostMap(pMap);
          }
        } else {
          setCommentPostMap(new Map());
        }

        if (user) {
          const commentIds = rows.map((c) => c.id);
          const { data: reports } = await supabase
            .from('comment_reports')
            .select('comment_id')
            .eq('reporter_id', (user as any).id)
            .in('comment_id', commentIds);
          if (reports && !cancelled) {
            setReportedCommentIds(new Set(reports.map((r: any) => r.comment_id)));
          }
        }
      }
      setCommentsLoading(false);
    };

    void loadComments();

    return () => {
      cancelled = true;
    };
  }, [postId, posts.length, activeTab, user]);

  // Load playlists containing this post (used for Playlists tab and tab count)
  useEffect(() => {
    if (!postId || posts.length === 0) return;

    let cancelled = false;

    const loadPlaylistsForPost = async () => {
      setPostPlaylistsLoading(true);
      setPostPlaylists([]);

      const { data: entries, error: entErr } = await supabase
        .from('playlist_entries')
        .select('playlist_id')
        .eq('post_id', postId);

      if (cancelled) return;

      if (entErr) {
        console.warn('Error loading playlist entries', entErr.message);
        setPostPlaylists([]);
        setPostPlaylistsLoading(false);
        return;
      }

      const ids = Array.from(new Set((entries ?? []).map((e: any) => e.playlist_id)));
      if (ids.length === 0) {
        setPostPlaylists([]);
        setPostPlaylistsLoading(false);
        return;
      }

      const { data: pls, error: plErr } = await supabase
        .from('playlists')
        .select(
          'id, title, description, created_at, owner:profiles!playlists_owner_id_fkey(username), entries:playlist_entries(count)',
        )
        .in('id', ids)
        .order('updated_at', { ascending: false });

      if (cancelled) return;

      if (plErr) {
        console.warn('Error loading playlists for post', plErr.message);
        setPostPlaylists([]);
      } else {
        const rows: Playlist[] = (pls ?? []).map((p: any) => ({
          id: p.id as string,
          name: p.title as string,
          description: (p.description as string) ?? '',
          created_at: p.created_at as string,
          author_id: '',
          author_username: (p.owner?.username as string) ?? null,
          postsCount: (p.entries?.[0]?.count as number) ?? 0,
        }));
        setPostPlaylists(rows);
      }

      setPostPlaylistsLoading(false);
    };

    void loadPlaylistsForPost();

    return () => {
      cancelled = true;
    };
  }, [postId, posts.length]);

  const handleSubmitComment = async () => {
    if (!user || !newComment.trim() || posts.length === 0) return;
    setCommentPending(true);
    setCommentError('');

    const contentWithIds = await convertMentionsToIds(newComment.trim());

    const { data, error } = await supabase.rpc('create_comment', {
      p_post_id: posts[0].id,
      p_content: contentWithIds,
    });

    if (error) {
      console.warn('Error adding comment', error.message);
      setCommentError('Failed to add comment. Please try again.');
      setCommentPending(false);
      return;
    }

    if (data?.error) {
      setCommentError(data.error);
      setCommentPending(false);
      return;
    }

    const newMentionIds = extractMentionUserIds(data.content);
    if (newMentionIds.length > 0) {
      const missingIds = newMentionIds.filter((id) => !commentMentionUserMap.has(id));
      if (missingIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', missingIds);
        if (profiles) {
          setCommentMentionUserMap((prev) => {
            const newMap = new Map(prev);
            for (const p of profiles) {
              newMap.set(p.id, p.username);
            }
            return newMap;
          });
        }
      }
    }

    setComments((prev) => [
      ...prev,
      {
        id: data.id,
        content: data.content,
        created_at: data.created_at,
        author_id: data.author_id,
        author_username: currentUsername ?? null,
      },
    ]);
    setNewComment('');
    setCommentPending(false);
  };

  const handleOpenDeleteConfirm = (commentId: string, authorId: string) => {
    setDeleteConfirmOpen(commentId);
    setDeleteConfirmAuthorId(authorId);
    setDeleteAlsoReport(false);
    setDeleteReportCategory('');
  };

  const handleConfirmDelete = async () => {
    if (!user || !deleteConfirmOpen) return;
    setDeletePending(true);

    if (deleteAlsoReport && deleteReportCategory && deleteConfirmAuthorId !== (user as any).id) {
      await supabase.from('comment_reports').insert({
        reporter_id: (user as any).id,
        comment_id: deleteConfirmOpen,
        reason: deleteReportCategory,
      });
      setReportedCommentIds((prev) => new Set([...prev, deleteConfirmOpen]));
    }

    const { error } = await supabase
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteConfirmOpen);
    if (error) {
      console.warn('Error deleting comment', error.message);
      setDeletePending(false);
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== deleteConfirmOpen));
    setDeleteConfirmOpen(null);
    setDeleteConfirmAuthorId(null);
    setDeletePending(false);
  };

  const handleOpenCommentReport = (commentId: string) => {
    if (!user) {
      void router.push('/login');
      return;
    }
    setCommentReportOpen(commentId);
    setCommentReportCategory('');
    setCommentReportDetails('');
  };

  const handleSubmitCommentReport = async () => {
    if (!user || !commentReportOpen || !commentReportCategory) return;
    setCommentReportPending(true);

    const { error } = await supabase.from('comment_reports').insert({
      reporter_id: (user as any).id,
      comment_id: commentReportOpen,
      reason: commentReportCategory,
      details: commentReportDetails || null,
    });

    if (error) {
      console.warn('Error reporting comment', error.message);
      setCommentReportPending(false);
      return;
    }

    setReportedCommentIds((prev) => new Set([...prev, commentReportOpen]));
    setCommentReportOpen(null);
    setCommentReportPending(false);
  };

  const isWeeklyParticipation =
    currentWeekNumber !== null &&
    posts.length > 0 &&
    !posts[0]?.is_draft &&
    new RegExp(`(^|\\s)#week${currentWeekNumber}(?!\\w)`).test(posts[0]?.description ?? '');

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <>
      <section>
        <button type="button" className="button ghost" onClick={handleBack}>
          ← Back
        </button>
        <h2>Post detail</h2>

        {loading && <p>Loading…</p>}
        {!loading && error && <p className="error-message">{error}</p>}

        {!loading && !error && posts.length > 0 && (
          <>
            {isWeeklyParticipation && currentWeekTheme && (
              <div className="info-panel">
                <div>
                  This post participates in the{' '}
                  <Link href="/explore?tab=weekly">#week{currentWeekNumber} challenge</Link>.
                </div>
                <div>This week&#39;s theme is &#34;{currentWeekTheme}&#34;.</div>
              </div>
            )}

            <PostList
              posts={posts}
              currentUserId={user ? (user as any).id : undefined}
              skipMinification={true}
            />

            {posts[0]?.description && (
              <p className="post-description-detail white-space-pre-wrap">
                {renderDescriptionWithTagsAndMentions(
                  posts[0].description,
                  mentionUserMap,
                  postMap,
                )}
              </p>
            )}

            {posts[0]?.license &&
              (() => {
                const licenseInfo = LICENSE_OPTIONS.find((opt) => opt.value === posts[0].license);
                if (!licenseInfo) return null;
                const requiresAttribution =
                  posts[0].license === 'cc-by' || posts[0].license === 'cc-by-sa';
                return (
                  <div className="post-license">
                    <p>
                      {licenseInfo.url ? (
                        <a href={licenseInfo.url} target="_blank" rel="noopener noreferrer">
                          {licenseInfo.label}
                        </a>
                      ) : (
                        <span>{licenseInfo.label}</span>
                      )}
                    </p>
                    {requiresAttribution && posts[0].author_username && (
                      <p className="post-license-attribution">
                        Attribution: credit @{posts[0].author_username} and link to this page.
                      </p>
                    )}
                  </div>
                );
              })()}

            <div className="post-detail-actions">
              {!(
                posts[0]?.license === 'all-rights-reserved' &&
                posts[0]?.profile_id !== (user as any)?.id
              ) && (
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => setShowExportModal(true)}
                >
                  Export to WAV
                </button>
              )}
              {user && posts[0]?.profile_id === (user as any).id && (
                <button
                  type="button"
                  className="button secondary small ml-10"
                  onClick={() => router.push(`/export-video/${posts[0].id}`)}
                >
                  Export Video
                </button>
              )}
              <button type="button" className="button secondary small ml-10" onClick={handleShare}>
                {shareButtonText}
              </button>
              {user && (
                <button
                  type="button"
                  className="button secondary small ml-10"
                  onClick={() => void openAddToPlaylist()}
                >
                  Add to playlist
                </button>
              )}
              {user && posts[0]?.profile_id !== (user as any).id && (
                <button
                  type="button"
                  className="button secondary small ml-auto"
                  onClick={handleReportPost}
                  disabled={hasReported}
                >
                  {hasReported ? 'Reported' : 'Report'}
                </button>
              )}
            </div>

            {showExportModal && posts[0] && (
              <ExportWavModal
                expression={posts[0].expression}
                mode={(posts[0].mode as ModeOption) || ModeOption.Uint8}
                sampleRate={posts[0].sample_rate || 8000}
                title={posts[0].title || 'bytebeat'}
                onClose={() => setShowExportModal(false)}
              />
            )}

            <div className="tab-header mt-30 mb-30">
              <span
                className={`tab-button ${activeTab === 'comments' ? 'active' : ''}`}
                onClick={() => setActiveTab('comments')}
              >
                Comments ({comments.length})
              </span>
              <span
                className={`tab-button ${activeTab === 'playlists' ? 'active' : ''}`}
                onClick={() => setActiveTab('playlists')}
              >
                Playlists ({postPlaylists.length})
              </span>
              <span
                className={`tab-button ${activeTab === 'lineage' ? 'active' : ''}`}
                onClick={() => setActiveTab('lineage')}
              >
                Lineage
              </span>
            </div>

            {activeTab === 'comments' && (
              <div id="comments" className="comments-section">
                {commentsLoading && <p className="text-centered">Loading comments…</p>}
                {!commentsLoading && comments.length === 0 && (
                  <p className="secondary-text text-centered">
                    No comments yet. Be the first to comment!
                  </p>
                )}
                {!commentsLoading && comments.length > 0 && (
                  <ul className="comments-list">
                    {comments.map((c) => (
                      <li key={c.id} className="comment-item">
                        <div className="comment-header">
                          <Link href={`/u/${c.author_username}`} className="comment-author">
                            @{formatAuthorUsername(c.author_username)}
                          </Link>
                          <span className="comment-date">{formatRelativeTime(c.created_at)}</span>
                          {user &&
                            ((user as any).id === c.author_id ||
                              posts[0]?.profile_id === (user as any).id) && (
                              <button
                                type="button"
                                className="button ghost small ml-auto"
                                onClick={() => handleOpenDeleteConfirm(c.id, c.author_id)}
                              >
                                Delete
                              </button>
                            )}
                          {user &&
                            (user as any).id !== c.author_id &&
                            posts[0]?.profile_id !== (user as any).id && (
                              <button
                                type="button"
                                className="button ghost small ml-auto"
                                onClick={() => handleOpenCommentReport(c.id)}
                                disabled={reportedCommentIds.has(c.id)}
                              >
                                {reportedCommentIds.has(c.id) ? 'Reported' : 'Report'}
                              </button>
                            )}
                        </div>
                        <p className="comment-content white-space-pre-wrap">
                          {renderDescriptionWithTagsAndMentions(
                            c.content,
                            commentMentionUserMap,
                            commentPostMap,
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {user ? (
                  <div className="comment-form">
                    <AutocompleteTextarea
                      value={newComment}
                      onChange={setNewComment}
                      placeholder="Add a comment..."
                      rows={2}
                      maxLength={COMMENT_MAX}
                      className="border-bottom-accent-focus"
                    />
                    <div className="comment-form-footer">
                      <span className="secondary-text" style={{ fontSize: '12px' }}>
                        {newComment.length}/{COMMENT_MAX}
                      </span>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => void handleSubmitComment()}
                        disabled={commentPending || !newComment.trim()}
                      >
                        {commentPending ? 'Posting…' : 'Post comment'}
                      </button>
                    </div>
                    {commentError && (
                      <p className="error-message" style={{ marginTop: '8px' }}>
                        {commentError}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="secondary-text">
                    <Link href="/login">Log in</Link> to leave a comment.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'playlists' && (
              <div id="playlists" className="playlists-section">
                {postPlaylistsLoading && <p className="text-centered">Loading playlists…</p>}
                {!postPlaylistsLoading && postPlaylists.length === 0 && (
                  <p className="secondary-text text-centered">
                    No playlists yet. Add this track to a playlist.
                  </p>
                )}
                {!postPlaylistsLoading && postPlaylists.length > 0 && (
                  <ul>
                    {postPlaylists.map((pl) => (
                      <PlaylistCard
                        key={pl.id}
                        id={pl.id}
                        name={pl.name}
                        description={pl.description}
                        postsCount={pl.postsCount}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}

            {activeTab === 'lineage' && <PostLineage postId={posts[0].id} />}
          </>
        )}
      </section>
      {deleteConfirmOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '16px' }}>Delete comment?</h2>
            <p style={{ marginTop: 0, marginBottom: '12px', fontSize: '13px', opacity: 0.9 }}>
              This action cannot be undone.
            </p>
            {user && deleteConfirmAuthorId && deleteConfirmAuthorId !== (user as any).id && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={deleteAlsoReport}
                    onChange={(e) => setDeleteAlsoReport(e.target.checked)}
                    disabled={deletePending}
                  />
                  <span style={{ fontSize: '13px' }}>Also report this comment</span>
                </label>
                {deleteAlsoReport && (
                  <select
                    value={deleteReportCategory}
                    onChange={(e) => setDeleteReportCategory(e.target.value)}
                    style={{ width: '100%', marginTop: '8px' }}
                    disabled={deletePending}
                  >
                    <option value="" disabled>
                      Select a reason
                    </option>
                    <option value="Spam">Spam</option>
                    <option value="Harassment">Harassment</option>
                    <option value="Hate">Hate</option>
                    <option value="Sexual content">Sexual content</option>
                    <option value="Other">Other</option>
                  </select>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setDeleteConfirmOpen(null)}
                disabled={deletePending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => void handleConfirmDelete()}
                disabled={deletePending || (deleteAlsoReport && !deleteReportCategory)}
              >
                {deletePending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {addToPlaylistOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '16px' }}>Add to playlist</h2>
            <p className="secondary-text" style={{ marginTop: 0, marginBottom: '12px' }}>
              Choose one of your playlists or create a new one.
            </p>
            {playlistsLoading ? (
              <p className="text-centered">Loading…</p>
            ) : playlists.length > 0 ? (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  maxHeight: 240,
                  overflowY: 'auto',
                }}
              >
                {playlists.map((pl) => {
                  const alreadyHas = postPlaylistIdSet.has(pl.id);
                  return (
                    <li
                      key={pl.id}
                      style={{ display: 'flex', alignItems: 'center', padding: '8px 0' }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{pl.name}</div>
                        {pl.description && (
                          <div className="secondary-text" style={{ fontSize: 12, marginTop: 2 }}>
                            {pl.description}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="button small"
                        onClick={() => {
                          if (!alreadyHas) void handleAppendToPlaylist(pl.id);
                        }}
                        disabled={addToPlaylistPending || alreadyHas}
                        aria-disabled={addToPlaylistPending || alreadyHas}
                        title={alreadyHas ? 'This post is already in this playlist' : undefined}
                      >
                        {alreadyHas ? 'Added' : addToPlaylistPending ? 'Adding…' : 'Add'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="secondary-text">You have no playlists yet.</p>
            )}
            {addToPlaylistError && (
              <p className="error-message" style={{ marginTop: '8px' }}>
                {addToPlaylistError}
              </p>
            )}
            <div
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12 }}
            >
              <button
                type="button"
                className="button secondary"
                onClick={() => setAddToPlaylistOpen(false)}
                disabled={addToPlaylistPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                onClick={() => router.push(`/playlists/new?sourcePostId=${posts[0]?.id}`)}
                disabled={addToPlaylistPending}
              >
                Create new playlist
              </button>
            </div>
          </div>
        </div>
      )}
      {commentReportOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '16px' }}>Report comment</h2>
            <p style={{ marginTop: 0, marginBottom: '12px', fontSize: '13px', opacity: 0.9 }}>
              Reports are confidential. The comment author will not know who reported them. Reports
              are reviewed by moderators.
            </p>
            <select
              value={commentReportCategory}
              onChange={(e) => setCommentReportCategory(e.target.value)}
              style={{ width: '100%', marginBottom: '12px' }}
              disabled={commentReportPending}
            >
              <option value="" disabled>
                Select a reason
              </option>
              <option value="Spam">Spam</option>
              <option value="Harassment">Harassment</option>
              <option value="Hate">Hate</option>
              <option value="Sexual content">Sexual content</option>
              <option value="Other">Other</option>
            </select>
            {commentReportCategory === 'Other' && (
              <textarea
                value={commentReportDetails}
                onChange={(e) => setCommentReportDetails(e.target.value)}
                placeholder="Please provide details..."
                rows={3}
                className="border-bottom-accent-focus"
                style={{ width: '100%', marginBottom: '12px', resize: 'vertical' }}
                disabled={commentReportPending}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setCommentReportOpen(null)}
                disabled={commentReportPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => void handleSubmitCommentReport()}
                disabled={
                  commentReportPending ||
                  !commentReportCategory ||
                  (commentReportCategory === 'Other' && !commentReportDetails.trim())
                }
              >
                Submit report
              </button>
            </div>
          </div>
        </div>
      )}
      {reportOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '16px' }}>Report post</h2>
            <p style={{ marginTop: 0, marginBottom: '12px', fontSize: '13px', opacity: 0.9 }}>
              Reports are confidential. The post author will not know who reported them. Reports are
              reviewed by moderators.
            </p>
            <select
              value={reportCategory}
              onChange={(e) => setReportCategory(e.target.value)}
              style={{ width: '100%', marginBottom: '12px' }}
              disabled={reportPending}
            >
              <option value="" disabled>
                Select a reason
              </option>
              <option value="Spam">Spam</option>
              <option value="Harassment">Harassment</option>
              <option value="Hate">Hate</option>
              <option value="Sexual content">Sexual content</option>
              <option value="Copyright violation">Copyright violation</option>
              <option value="Malicious code">Malicious code</option>
              <option value="Other">Other</option>
            </select>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Additional details..."
              rows={4}
              className="border-bottom-accent-focus"
              style={{ width: '100%', marginBottom: '12px', resize: 'vertical' }}
              disabled={reportPending}
            />
            {reportError && <p className="error-message">{reportError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="button secondary"
                onClick={closeReport}
                disabled={reportPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => void submitReport()}
                disabled={
                  reportPending ||
                  !reportCategory ||
                  (reportCategory === 'Other' && !reportDetails.trim())
                }
              >
                Submit report
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
