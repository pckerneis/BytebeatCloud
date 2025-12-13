import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { PostExpressionPlayer } from '../components/PostExpressionPlayer';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { validateExpression } from '../utils/expression-validator';
import { ModeOption } from '../model/expression';
import { PostRow } from '../components/PostList';

interface HallOfFameRow extends PostRow {
  week_number: number;
  theme: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

export default function WeeklyHallOfFamePage() {
  const [rows, setRows] = useState<HallOfFameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { toggle, stop, isPlaying } = useBytebeatPlayer();
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const { setPlaylist, setCurrentPostById, currentPost } = usePlayerStore();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');

      const { data, error } = await supabase
        .from('weekly_hall_of_fame')
        .select('*')
        .order('week_number', { ascending: false });

      if (cancelled) return;

      if (error) {
        setError(error.message ?? String(error));
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as HallOfFameRow[]);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleExpressionClick = async (post: PostRow) => {
    // Clicking the active post stops playback
    if (isPlaying && activePostId === post.id) {
      await stop();
      setActivePostId(null);
      setCurrentPostById(null);
      return;
    }

    // Ensure any existing playback is fully stopped before starting a new one
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
    setPlaylist(rows, post.id);
    setCurrentPostById(post.id);
  };

  return (
    <>
      <Head>
        <title>Weekly Hall of Fame - BytebeatCloud</title>
        <meta
          name="description"
          content="Browse past Bytebeat of the Week winners on BytebeatCloud"
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Weekly Hall of Fame - BytebeatCloud" />
        <meta
          property="og:description"
          content="Browse past Bytebeat of the Week winners on BytebeatCloud"
        />
        <meta
          property="og:image"
          content={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/og/default`}
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <section>
        <h2>Weekly Hall of Fame</h2>
        <p>
          A list of past <Link href={'/about-weekly'}>Bytebeat of the Week</Link> winners. Each week
          highlights a theme and a community-picked top bytebeat.
        </p>

        {loading && <p className="text-centered">Loading winners…</p>}
        {error && !loading && <p className="error-message">{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p className="text-centered">No past weekly winners yet.</p>
        )}

        {!loading && !error && rows.length > 0 && (
          <ul className="post-list">
            {rows.map((row) => (
              <li
                key={`${row.week_number}-${row.id}`}
                className={`post-item ${row.id == currentPost?.id ? 'playing' : ''}`}
              >
                <div className="post-header">
                  <div className="post-meta">
                    <span className="chip">
                      Week #{row.week_number} - Theme: &quot;{row.theme ?? 'Unknown'}&quot;
                    </span>
                  </div>
                  <h3>
                    <Link href={`/post/${row.id}`} className="post-title">
                      {row.title || '(untitled)'} by @{row.author_username ?? 'unknown'}
                    </Link>
                  </h3>
                  <PostExpressionPlayer
                    expression={row.expression}
                    isActive={isPlaying && row.id === currentPost?.id}
                    onTogglePlay={() => handleExpressionClick(row)}
                    height={75}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
