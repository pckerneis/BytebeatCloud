import { useEffect, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { supabase } from '../lib/supabaseClient';
import { PostList, type PostRow } from '../components/PostList';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { enrichWithViewerFavorites } from '../utils/favorites';
import { enrichWithTags } from '../utils/tags';
import { validateExpression } from '../utils/expression-validator';
import { PostExpressionPlayer } from '../components/PostExpressionPlayer';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { ModeOption } from '../model/expression';

function shortenVersion(version: string | undefined): string | undefined {
  return version?.slice(0, 7);
}

export default function Home() {
  const { user } = useSupabaseAuth();
  const [trendingPosts, setTrendingPosts] = useState<PostRow[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState('');
  const [topPickPost, setTopPickPost] = useState<PostRow | null>(null);
  const [topPickLoading, setTopPickLoading] = useState(false);
  const [topPickError, setTopPickError] = useState('');
  const [currentTheme, setCurrentTheme] = useState<string | null>(null);
  const [currentWeekNumber, setCurrentWeekNumber] = useState<number | null>(null);

  const { toggle, stop, isPlaying } = useBytebeatPlayer();
  const { setPlaylist, setCurrentPostById } = usePlayerStore();
  const [activeTopPickId, setActiveTopPickId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadTrending = async () => {
      setTrendingLoading(true);
      setTrendingError('');

      const rpcResult = await supabase.rpc('get_trending_feed', { page: 0 });

      if (cancelled) return;

      if (rpcResult.error) {
        setTrendingError(rpcResult.error.message ?? String(rpcResult.error));
        setTrendingPosts([]);
        setTrendingLoading(false);
        return;
      }

      let rows = (rpcResult.data ?? []) as PostRow[];

      if (user && rows.length > 0) {
        rows = (await enrichWithViewerFavorites((user as any).id as string, rows)) as PostRow[];
      }

      if (rows.length > 0) {
        rows = (await enrichWithTags(rows)) as PostRow[];
      }

      // Security: drop posts with invalid expressions
      rows = rows.filter((r) => validateExpression(r.expression).valid);

      setTrendingPosts(rows);
      setTrendingLoading(false);
    };

    void loadTrending();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const loadWeekly = async () => {
      setTopPickLoading(true);
      setTopPickError('');
      setTopPickPost(null);

      const nowIso = new Date().toISOString();

      // Load the current weekly challenge to get the theme.
      const { data: currentWeekly, error: currentError } = await supabase.rpc(
        'get_current_weekly_challenge',
      );

      if (cancelled) return;

      if (!currentError && currentWeekly) {
        const challengeRow = Array.isArray(currentWeekly) ? currentWeekly[0] : currentWeekly;
        setCurrentWeekNumber((challengeRow as any).week_number ?? null);
        setCurrentTheme((challengeRow as any).theme ?? null);
      } else {
        setCurrentWeekNumber(null);
        setCurrentTheme(null);
      }

      // Load the most recent completed challenge with a winner.
      const { data: latestWinner, error: previousError } = await supabase.rpc(
        'get_latest_weekly_challenge_winner',
      );

      if (cancelled) return;

      const previousChallengeRow =
        latestWinner && Array.isArray(latestWinner) ? latestWinner[0] : latestWinner;

      if (previousError || !previousChallengeRow || !(previousChallengeRow as any).winner_post_id) {
        setTopPickPost(null);
        if (previousError) {
          setTopPickError('Unable to load featured post.');
        }
        setTopPickLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,description,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count',
        )
        .eq('id', (previousChallengeRow as any).winner_post_id)
        .eq('is_draft', false)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setTopPickPost(null);
        setTopPickError('Unable to load featured post.');
        setTopPickLoading(false);
        return;
      }

      let row = data as PostRow;

      if (!validateExpression(row.expression).valid) {
        setTopPickPost(null);
        setTopPickError('Featured post has an invalid expression.');
        setTopPickLoading(false);
        return;
      }

      setTopPickPost(row);
      setTopPickLoading(false);
    };

    void loadWeekly();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleTopPickPlay = async (post: PostRow) => {
    if (isPlaying && activeTopPickId === post.id) {
      await stop();
      setActiveTopPickId(null);
      setCurrentPostById(null);
      return;
    }

    await stop();

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
    setActiveTopPickId(post.id);
    setPlaylist([post], post.id);
    setCurrentPostById(post.id);
  };

  const linkToDiscord = process.env.NEXT_PUBLIC_DISCORD_LINK;

  return (
    <>
      <Head>
        <title>BytebeatCloud - Create and share bytebeat music</title>
        <meta
          name="description"
          content="A platform to explore and share tiny musical expressions"
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="BytebeatCloud" />
        <meta
          property="og:description"
          content="A platform to explore and share tiny musical expressions"
        />
        <meta
          property="og:image"
          content={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/og/default`}
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <section className="home-section">
        <h2>Welcome to BytebeatCloud!</h2>
        <p>
          A platform to <Link href="/explore">explore</Link> and <Link href="/create">share</Link>{' '}
          tiny musical expressions.
        </p>

        <p>
          This app is still in development. Expect bugs and incomplete features. Contributions
          welcome on{' '}
          <Link href="https://github.com/pckerneis/BytebeatCloud" target="_blank">
            GitHub
          </Link>
          !
        </p>

        {linkToDiscord && (
          <p>
            Join the community on <Link href={linkToDiscord}>Discord</Link> to exchange about
            bytebeat techniques, suggest features or report bugs.
          </p>
        )}

        {currentTheme && (
          <fieldset>
            <legend>Bytebeat of the Week</legend>
            <>
              {topPickLoading && <p>Loading last week&apos;s top pick…</p>}
              {!topPickLoading && topPickError && <p className="error-message">{topPickError}</p>}
              {!topPickLoading && !topPickError && topPickPost && (
                <>
                  <p>
                    Last Week&apos;s Top Pick is{' '}
                    <Link href={`/post/${topPickPost.id}`}>
                      {topPickPost.title || '(untitled)'} by @
                      {topPickPost.author_username || 'unknown'}
                    </Link>
                  </p>
                  <PostExpressionPlayer
                    expression={topPickPost.expression}
                    isActive={isPlaying && activeTopPickId === topPickPost.id}
                    onTogglePlay={() => handleTopPickPlay(topPickPost)}
                    height={75}
                  />
                </>
              )}
            </>
            <p>Week #{currentWeekNumber}: theme is &quot;{currentTheme ?? 'TBA'}&quot;</p>
            <ul>
              <li>
                <Link href="/explore?tab=weekly">View entries</Link>
              </li>
              <li>
                <Link href="/create?weekly">Submit yours</Link>
              </li>
              <li>
                <Link href="/about-weekly">About</Link>
              </li>
            </ul>
          </fieldset>
        )}

        <fieldset>
          <legend>What is bytebeat?</legend>
          <p>
            Bytebeat is a minimalist music format where sounds are generated by small programs that
            use arithmetic and bitwise operations to create unique algorithmic soundscapes.
          </p>

          <p>
            <Link href="/explore">Browse existing bytebeats</Link> or{' '}
            <Link href="/create">create your own</Link>.
          </p>
        </fieldset>

        <section style={{ marginTop: '24px' }}>
          <h3>Trending posts</h3>
          {trendingLoading && <p className="text-centered">Loading trending posts…</p>}
          {!trendingLoading && trendingError && <p className="error-message">{trendingError}</p>}
          {!trendingLoading && !trendingError && trendingPosts.length === 0 && (
            <p className="text-centered">No trending posts yet.</p>
          )}
          {!trendingLoading && !trendingError && trendingPosts.length > 0 && (
            <>
              <PostList posts={trendingPosts} currentUserId={user ? (user as any).id : undefined} />
              <p className="text-centered">
                <Link href="/explore">Explore more posts →</Link>
              </p>
            </>
          )}
        </section>

        <div className="home-footer">
          <div>
            <div>BytebeatCloud</div>
            <div title={process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'}>
              {shortenVersion(process.env.NEXT_PUBLIC_APP_VERSION) ?? 'dev'}
            </div>
          </div>
          <div>
            <div>
              <Link href="/terms">Terms of Service</Link>
            </div>
            <div>
              <Link href="/privacy">Privacy Policy</Link>
            </div>
            <div>
              <Link href="/legal-notice">Legal Notice</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
