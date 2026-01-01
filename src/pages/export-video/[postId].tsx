import { useRouter } from 'next/router';
import { useEffect, useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import { supabase } from '../../lib/supabaseClient';
import { enrichWithTags } from '../../utils/tags';
import type { PostRow } from '../../components/PostList';
import {
  exportVideo,
  downloadVideo,
  isWebCodecsSupported,
  hasWebCodecs,
  renderPreviewFrame,
  type Orientation,
  type Resolution,
} from '../../utils/video-export';
import { ModeOption } from '../../model/expression';
import { useThemeId } from '../../theme/ThemeContext';
import {
  formatPostTitle,
  formatAuthorUsername,
  formatAuthorDashTitle,
} from '../../utils/post-format';

interface VideoTheme {
  accentColor: string;
  bgColor: string;
  textColor: string;
  codeBgColor: string;
}

function getThemeColors(): VideoTheme {
  if (typeof window === 'undefined') {
    return {
      accentColor: '#7b34ff',
      bgColor: '#0e1a2b',
      textColor: '#dde8f5',
      codeBgColor: '#0d1119',
    };
  }
  const styles = getComputedStyle(document.body);
  return {
    accentColor: styles.getPropertyValue('--accent-color').trim() || '#7b34ff',
    bgColor: styles.getPropertyValue('--bg-color').trim() || '#0e1a2b',
    textColor: styles.getPropertyValue('--text-color').trim() || '#dde8f5',
    codeBgColor: styles.getPropertyValue('--card-text-color').trim() || '#dde8f5',
  };
}

interface VideoExportSettings {
  length: number;
  orientation: Orientation;
  resolution: Resolution;
  fadeOut: boolean;
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

const MIN_LENGTH = 10;
const MAX_LENGTH = 300;

export default function ExportVideoPage() {
  const router = useRouter();
  const { postId } = router.query;

  const [post, setPost] = useState<PostRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const themeId = useThemeId();

  const [settings, setSettings] = useState<VideoExportSettings>({
    length: 60,
    orientation: 'landscape',
    resolution: '720p',
    fadeOut: true,
  });

  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState('');
  const [webCodecsSupported, setWebCodecsSupported] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setWebCodecsSupported(isWebCodecsSupported());
    setUsingFallback(!hasWebCodecs());
  }, []);

  const updatePreview = useCallback(() => {
    if (!post || !previewContainerRef.current) return;

    const themeColors = getThemeColors();
    const canvas = renderPreviewFrame({
      expression: post.expression,
      title: formatPostTitle(post.title),
      authorUsername: formatAuthorUsername(post.author_username),
      orientation: settings.orientation,
      resolution: settings.resolution,
      accentColor: themeColors.accentColor,
      bgColor: themeColors.bgColor,
      textColor: themeColors.textColor,
    });

    // Clear previous preview and add new one
    const container = previewContainerRef.current;
    container.innerHTML = '';
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    container.appendChild(canvas);
  }, [post, settings.orientation, settings.resolution]);

  useEffect(() => {
    // Use requestAnimationFrame to wait for CSS to be applied after theme change
    const frameId = requestAnimationFrame(() => {
      updatePreview();
    });
    return () => cancelAnimationFrame(frameId);
  }, [updatePreview, themeId]);

  useEffect(() => {
    if (!postId || typeof postId !== 'string') return;

    let cancelled = false;

    const loadPost = async () => {
      setLoading(true);
      setError('');

      const { data, error: fetchError } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,description,expression,is_draft,sample_rate,mode,created_at,profile_id,author_username,favorites_count,favorited_by_current_user',
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

      // Enrich with tags
      let postWithTags = data as PostRow;
      const enriched = await enrichWithTags([postWithTags]);
      postWithTags = enriched[0] as PostRow;

      setPost(postWithTags);
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
    setExportStatus('Starting export...');
    setExportProgress(0);
    setExportError('');

    try {
      const mode =
        post.mode === 'float'
          ? ModeOption.Float
          : post.mode === 'int8'
            ? ModeOption.Int8
            : ModeOption.Uint8;

      const themeColors = getThemeColors();

      const blob = await exportVideo({
        expression: post.expression,
        mode,
        sampleRate: post.sample_rate || 8000,
        duration: settings.length,
        orientation: settings.orientation,
        resolution: settings.resolution,
        fadeOut: settings.fadeOut,
        title: formatPostTitle(post.title),
        authorUsername: formatAuthorUsername(post.author_username),
        accentColor: themeColors.accentColor,
        bgColor: themeColors.bgColor,
        textColor: themeColors.textColor,
        onProgress: (status, progress) => {
          setExportStatus(status);
          setExportProgress(progress);
        },
      });

      const safeTitle = formatAuthorDashTitle(post.author_username, post.title)
        .replace(/[^a-z0-9-]/gi, '_')
        .substring(0, 50);
      const extension = hasWebCodecs() ? 'mp4' : 'webm';
      const filename = `${safeTitle}_${settings.resolution}_${settings.orientation}.${extension}`;

      downloadVideo(blob, filename);
      setExportStatus('Download started!');
    } catch (err) {
      console.error('Export error:', err);
      setExportError(err instanceof Error ? err.message : 'Export failed');
      setExportStatus('');
    } finally {
      setExporting(false);
    }
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

        {!webCodecsSupported && (
          <div className="error-message">
            <p>
              <strong>WebCodecs API not supported</strong>
            </p>
            <p>
              Video export requires the WebCodecs API which is not available in your browser. Please
              use a recent version of Chrome, Edge, or Opera.
            </p>
          </div>
        )}

        {!loading && !error && post && webCodecsSupported && (
          <div className="export-video-form">
            <p className="export-video-post-title">
              Exporting: <strong>{formatPostTitle(post.title)}</strong>
              {post.author_username && <span> by @{post.author_username}</span>}
            </p>

            <div className="video-preview-container" ref={previewContainerRef} />

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

            {usingFallback && (
              <div className="info-panel">
                Note: WebCodecs not available. Export runs in real-time using MediaRecorder. A{' '}
                {settings.length}s video will take approximately {settings.length}s to export (WebM
                format).
              </div>
            )}

            {exportError && (
              <div className="export-error">
                <p className="error-message">{exportError}</p>
              </div>
            )}

            {exporting && (
              <div className="export-progress">
                <p className="export-status">{exportStatus}</p>
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: `${exportProgress}%` }} />
                </div>
              </div>
            )}

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
