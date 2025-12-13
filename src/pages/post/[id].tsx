import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { ExportWavModal } from '../../components/ExportWavModal';
import { ModeOption } from '../../model/expression';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { PostList, type PostRow } from '../../components/PostList';
import Head from 'next/head';
import Link from 'next/link';
import { enrichWithViewerFavorites } from '../../utils/favorites';
import { enrichWithTags } from '../../utils/tags';
import { validateExpression } from '../../utils/expression-validator';
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
  const [forks, setForks] = useState<PostRow[]>([]);
  const [forksError, setForksError] = useState('');
  const [mentionUserMap, setMentionUserMap] = useState<Map<string, string>>(new Map());
  const [showExportModal, setShowExportModal] = useState(false);
  const [shareButtonText, setShareButtonText] = useState('Share');
  const [currentWeekNumber, setCurrentWeekNumber] = useState<number | null>(null);
  const [currentWeekTheme, setCurrentWeekTheme] = useState<string>('');

  const { user } = useSupabaseAuth();

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
      setForks([]);
      setForksError('');

      const { data, error } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,description,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count,is_weekly_winner',
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

      // Load published forks of this post
      const { data: forkRows, error: forkError } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,description,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count,is_weekly_winner',
        )
        .eq('fork_of_post_id', id)
        .eq('is_draft', false)
        .order('created_at', { ascending: false });

      if (forkError) {
        console.warn('Error loading forks for post', forkError.message);
        setForksError('Unable to load forks.');
      } else {
        let rows = (forkRows ?? []) as PostRow[];

        if (user && rows.length > 0) {
          rows = (await enrichWithViewerFavorites((user as any).id as string, rows)) as PostRow[];
        }

        if (rows.length > 0) {
          rows = (await enrichWithTags(rows)) as PostRow[];
        }

        // Filter out forks with invalid expressions
        rows = rows.filter((r) => validateExpression(r.expression).valid);
        setForks(rows);
      }

      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  useEffect(() => {
    let cancelled = false;

    const loadCurrentWeek = async () => {
      const { data, error } = await supabase.rpc('get_current_weekly_challenge');
      if (cancelled) return;

      if (!error && data) {
        const row = Array.isArray(data) ? data[0] : data;
        const week = (row as any)?.week_number as number | null | undefined;
        const theme = (row as any)?.theme as string | null | undefined;

        if (week && theme) {
          setCurrentWeekNumber(week);
          setCurrentWeekTheme(theme);
        }
      }
    };

    void loadCurrentWeek();

    return () => {
      cancelled = true;
    };
  }, []);

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
                  <Link href="/explore?tab=weekly">
                    #week{currentWeekNumber} challenge
                  </Link>
                  .
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
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowExportModal(true)}
              >
                Export to WAV
              </button>
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

            <h3>Forks</h3>
            {forksError && <p className="error-message">{forksError}</p>}
            {!forksError && forks.length === 0 && <p>No forks yet.</p>}
            {!forksError && forks.length > 0 && (
              <PostList posts={forks} currentUserId={user ? (user as any).id : undefined} />
            )}
          </>
        )}
      </section>
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
