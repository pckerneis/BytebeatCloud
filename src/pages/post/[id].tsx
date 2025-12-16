import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { ExportWavModal } from '../../components/ExportWavModal';
import { ModeOption } from '../../model/expression';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { PostList, type PostRow } from '../../components/PostList';
import { PostLineage } from '../../components/PostLineage';
import Head from 'next/head';
import Link from 'next/link';
import { enrichWithTags } from '../../utils/tags';
import { validateExpression } from '../../utils/expression-validator';
import { useCurrentWeeklyChallenge } from '../../hooks/useCurrentWeeklyChallenge';
import {
  renderDescriptionWithTagsAndMentions,
  extractMentionUserIds,
} from '../../utils/description-renderer';
import type { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';

interface PostMeta {
  id: string;
  title: string | null;
  author_username: string | null;
  description: string | null;
}

interface PostDetailPageProps {
  postMeta: PostMeta | null;
  baseUrl: string;
}

export default function PostDetailPage({ postMeta, baseUrl }: PostDetailPageProps) {
  const router = useRouter();
  const { id } = router.query;

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
    const [mentionUserMap, setMentionUserMap] = useState<Map<string, string>>(new Map());
  const [showExportModal, setShowExportModal] = useState(false);
  const [shareButtonText, setShareButtonText] = useState('Share');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [hasReported, setHasReported] = useState(false);
  const [reportPending, setReportPending] = useState(false);
  const [reportError, setReportError] = useState('');
  const { weekNumber: currentWeekNumber, theme: currentWeekTheme } = useCurrentWeeklyChallenge();

  const { user } = useSupabaseAuth();

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
    const shareUrl = `${baseUrl}/post/${id}`;
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
    if (!id || typeof id !== 'string') return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      setPosts([]);

      const { data, error } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,description,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count,is_weekly_winner,license',
        )
        .eq('id', id)
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

      // Validate expression; if invalid, block display
      if (!validateExpression(rowWithCount.expression).valid) {
        setError('This post contains an invalid expression.');
        setLoading(false);
        return;
      }

      // Attach tags for the main post.
      [rowWithCount] = (await enrichWithTags([rowWithCount])) as PostRow[];

      // Check if user has already reported this post
      if (user) {
        const { data: reportRow } = await supabase
          .from('post_reports')
          .select('id')
          .eq('reporter_id', (user as any).id)
          .eq('post_id', rowWithCount.id)
          .maybeSingle();
        if (!cancelled) setHasReported(!!reportRow);
      }

      // Fetch usernames for mentions in description
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

      setPosts([rowWithCount]);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const isWeeklyParticipation =
    currentWeekNumber !== null &&
    posts.length > 0 &&
    !posts[0]?.is_draft &&
    new RegExp(`(^|\\s)#week${currentWeekNumber}(?!\\w)`).test(posts[0]?.description ?? '');

  const pageTitle = postMeta?.title
    ? `${postMeta.title} by @${postMeta.author_username || 'unknown'} - BytebeatCloud`
    : 'BytebeatCloud - Post detail';
  const pageDescription = postMeta?.description
    ? postMeta.description.slice(0, 200)
    : 'Listen to this bytebeat creation on BytebeatCloud';
  const ogImageUrl = postMeta?.id ? `${baseUrl}/api/og/${postMeta.id}` : undefined;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        {ogImageUrl && <meta property="og:image" content={ogImageUrl} />}
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        {ogImageUrl && <meta name="twitter:image" content={ogImageUrl} />}
      </Head>
      <section>
        <button type="button" className="button ghost" onClick={() => router.back()}>
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

            <PostList posts={posts} currentUserId={user ? (user as any).id : undefined} />

            {posts[0]?.description && (
              <p className="post-description-detail">
                {renderDescriptionWithTagsAndMentions(posts[0].description, mentionUserMap)}
              </p>
            )}

            <div className="post-detail-actions">
              {!(posts[0]?.license === 'all-rights-reserved' && posts[0]?.profile_id !== (user as any)?.id) && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowExportModal(true)}
                >
                  Export to WAV
                </button>
              )}
              {user && posts[0]?.profile_id === (user as any).id && (
                <button
                  type="button"
                  className="button secondary ml-10"
                  onClick={() => router.push(`/export-video/${posts[0].id}`)}
                >
                  Export Video
                </button>
              )}
              <button type="button" className="button secondary ml-10" onClick={handleShare}>
                {shareButtonText}
              </button>
              {user && posts[0]?.profile_id !== (user as any).id && (
                <button
                  type="button"
                  className="button secondary ml-10"
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

            <h3>Lineage</h3>
            <PostLineage postId={posts[0].id} />
          </>
        )}
      </section>
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
            <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '16px' }}>
              Report post
            </h2>
            <p style={{ marginTop: 0, marginBottom: '12px', fontSize: '13px', opacity: 0.9 }}>
              Reports are confidential. The post author will not know who reported them.
              Reports are reviewed by moderators.
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

export const getServerSideProps: GetServerSideProps<PostDetailPageProps> = async (context) => {
  const { id } = context.params ?? {};
  const { req } = context;

  // Determine the base URL from the request
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const baseUrl = `${protocol}://${host}`;

  if (!id || typeof id !== 'string') {
    return { props: { postMeta: null, baseUrl } };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { props: { postMeta: null, baseUrl } };
  }

  const supabaseServer = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabaseServer
    .from('posts_with_meta')
    .select('id, title, author_username, description')
    .eq('id', id)
    .eq('is_draft', false)
    .maybeSingle();

  if (error || !data) {
    return { props: { postMeta: null, baseUrl } };
  }

  return {
    props: {
      postMeta: {
        id: data.id,
        title: data.title ?? null,
        author_username: data.author_username ?? null,
        description: data.description ?? null,
      },
      baseUrl,
    },
  };
};
