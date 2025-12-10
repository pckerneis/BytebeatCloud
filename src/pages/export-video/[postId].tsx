import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { supabase } from '../../lib/supabaseClient';
import type { PostRow } from '../../components/PostList';

type Orientation = 'portrait' | 'landscape' | 'square';
type Resolution = '480p' | '720p' | '1080p';

interface VideoExportSettings {
  length: number;
  orientation: Orientation;
  resolution: Resolution;
  fadeOut: boolean;
  showTags: boolean;
}

const ORIENTATION_OPTIONS: { value: Orientation; label: string }[] = [
  { value: 'portrait', label: 'Portrait (9:16)' },
  { value: 'landscape', label: 'Landscape (16:9)' },
  { value: 'square', label: 'Square (1:1)' },
];

const RESOLUTION_OPTIONS: { value: Resolution; label: string }[] = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
];

const MIN_LENGTH = 30;
const MAX_LENGTH = 300;

export default function ExportVideoPage() {
  const router = useRouter();
  const { postId } = router.query;

  const [post, setPost] = useState<PostRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [settings, setSettings] = useState<VideoExportSettings>({
    length: 60,
    orientation: 'landscape',
    resolution: '720p',
    fadeOut: true,
    showTags: true,
  });

  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!postId || typeof postId !== 'string') return;

    let cancelled = false;

    const loadPost = async () => {
      setLoading(true);
      setError('');

      const { data, error: fetchError } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,description,expression,is_draft,sample_rate,mode,created_at,profile_id,author_username,favorites_count',
        )
        .eq('id', postId)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError) {
        console.warn('Error loading post', fetchError.message);
        setError('Unable to load post.');
        setLoading(false);
        return;
      }

      if (!data) {
        setError('Post not found.');
        setLoading(false);
        return;
      }

      setPost(data as PostRow);
      setLoading(false);
    };

    void loadPost();

    return () => {
      cancelled = true;
    };
  }, [postId]);

  const handleLengthChange = (value: number) => {
    const clamped = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, value));
    setSettings((prev) => ({ ...prev, length: clamped }));
  };

  const handleExport = async () => {
    if (!post) return;

    setExporting(true);

    // TODO: Implement actual video export logic
    // For now, just simulate a delay and show settings
    console.log('Exporting video with settings:', {
      postId: post.id,
      title: post.title,
      ...settings,
    });

    // Simulate export delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    alert(
      `Video export started!\n\nSettings:\n- Length: ${settings.length}s\n- Orientation: ${settings.orientation}\n- Resolution: ${settings.resolution}\n- Fade out: ${settings.fadeOut ? 'Yes' : 'No'}\n- Show tags: ${settings.showTags ? 'Yes' : 'No'}`,
    );

    setExporting(false);
  };

  return (
    <>
      <Head>
        <title>Export Video - BytebeatCloud</title>
        <meta name="description" content="Export your bytebeat as a video" />
      </Head>
      <section>
        <button type="button" className="button ghost" onClick={() => router.back()}>
          ← Back
        </button>
        <h2>Export Video</h2>

        {loading && <p>Loading…</p>}
        {!loading && error && <p className="error-message">{error}</p>}

        {!loading && !error && post && (
          <div className="export-video-form">
            <p className="export-video-post-title">
              Exporting: <strong>{post.title || '(untitled)'}</strong>
              {post.author_username && <span> by @{post.author_username}</span>}
            </p>

            <div className="form-group">
              <label htmlFor="length">
                Length: <strong>{settings.length}s</strong>
              </label>
              <div className="range-input-container">
                <span className="range-label">{MIN_LENGTH}s</span>
                <input
                  type="range"
                  id="length"
                  min={MIN_LENGTH}
                  max={MAX_LENGTH}
                  value={settings.length}
                  onChange={(e) => handleLengthChange(Number(e.target.value))}
                  className="range-input"
                />
                <span className="range-label">{MAX_LENGTH}s</span>
              </div>
              <input
                type="number"
                min={MIN_LENGTH}
                max={MAX_LENGTH}
                value={settings.length}
                onChange={(e) => handleLengthChange(Number(e.target.value))}
                className="length-number-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="orientation">Orientation</label>
              <select
                id="orientation"
                value={settings.orientation}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, orientation: e.target.value as Orientation }))
                }
                className="select-input"
              >
                {ORIENTATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="resolution">Resolution</label>
              <select
                id="resolution"
                value={settings.resolution}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, resolution: e.target.value as Resolution }))
                }
                className="select-input"
              >
                {RESOLUTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.fadeOut}
                  onChange={(e) => setSettings((prev) => ({ ...prev, fadeOut: e.target.checked }))}
                />
                <span>Fade out at the end</span>
              </label>
            </div>

            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.showTags}
                  onChange={(e) => setSettings((prev) => ({ ...prev, showTags: e.target.checked }))}
                />
                <span>Show tags in video</span>
              </label>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="button primary"
                onClick={() => void handleExport()}
                disabled={exporting}
              >
                {exporting ? 'Exporting…' : 'Export Video'}
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
