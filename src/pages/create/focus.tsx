import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../../hooks/usePlayerStore';
import Head from 'next/head';
import { useExpressionPlayer } from '../../hooks/useExpressionPlayer';
import { useCtrlSpacePlayShortcut } from '../../hooks/useCtrlSpacePlayShortcut';
import { LicenseOption, DEFAULT_LICENSE } from '../../model/postEditor';
import { FocusLayout } from '../../components/FocusLayout';
import { NextPageWithLayout } from '../_app';
import { FocusExpressionEditor } from '../../components/FocusExpressionEditor';
import {
  ModeOption,
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
  DEFAULT_SAMPLE_RATE,
} from '../../model/expression';
import { validateExpression } from '../../utils/expression-validator';

const CREATE_DRAFT_STORAGE_KEY = 'bytebeat-cloud-create-draft-v1';

interface CreateDraftState {
  title?: string;
  description?: string;
  expression?: string;
  isDraft?: boolean;
  mode?: ModeOption;
  sampleRate?: number;
  license?: LicenseOption;
  liveUpdateEnabled?: boolean;
}

const page: NextPageWithLayout = function FocusCreatePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expression, setExpression] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [mode, setMode] = useState<ModeOption>(ModeOption.Uint8);
  const [sampleRate, setSampleRate] = useState<number>(DEFAULT_SAMPLE_RATE);
  const [license, setLicense] = useState<LicenseOption>(DEFAULT_LICENSE);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const { isPlaying, toggle, stop, updateExpression } = useBytebeatPlayer({
    enableVisualizer: false,
  });
  const { currentPost, setCurrentPostById } = usePlayerStore();
  const [liveUpdateEnabled, setLiveUpdateEnabled] = useState(true);
  const [isStateLoaded, setIsStateLoaded] = useState(false);

  const {
    handlePlayClick: handlePlayClickBase,
  } = useExpressionPlayer({
    expression,
    setExpression,
    mode,
    sampleRateValue: sampleRate,
    toggle,
    setCurrentPostById,
    loopPreview: true,
    isPlaying,
    liveUpdateEnabled,
    updateExpression,
    currentPost,
  });

  const handlePlayClick = () => handlePlayClickBase(currentPost);

  useEffect(() => {
    return () => {
      // Only stop if the editor's preview is playing (no post selected)
      if (!currentPost) {
        void stop();
      }
    };
  }, [stop, currentPost]);

  useCtrlSpacePlayShortcut(handlePlayClick);

  // Restore state from localStorage on mount (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const raw = localStorage.getItem(CREATE_DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed: CreateDraftState = JSON.parse(raw);
        if (typeof parsed.expression === 'string') setExpression(parsed.expression);
        if (parsed.mode) setMode(parsed.mode);
        if (parsed.sampleRate) setSampleRate(parsed.sampleRate);
        if (typeof parsed.liveUpdateEnabled === 'boolean') setLiveUpdateEnabled(parsed.liveUpdateEnabled);
      }
    } catch (e) {
      console.error('Failed to restore focus mode state:', e);
    } finally {
      setIsStateLoaded(true);
    }
  }, []);

  // Save state to localStorage when it changes (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined' || !isStateLoaded) return;
    
    try {
      const raw = localStorage.getItem(CREATE_DRAFT_STORAGE_KEY);
      const existing: CreateDraftState = raw ? JSON.parse(raw) : {};
      
      const updated: CreateDraftState = {
        ...existing,
        expression,
        mode,
        sampleRate,
        liveUpdateEnabled,
      };
      
      localStorage.setItem(CREATE_DRAFT_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save focus mode state:', e);
    }
  }, [expression, mode, sampleRate, liveUpdateEnabled, isStateLoaded]);

  useEffect(() => {
    // Only apply live updates when no post is playing (editor's expression is playing)
    if (!liveUpdateEnabled || !isPlaying || currentPost) return;

    const trimmed = expression.trim();
    if (!trimmed) return;

    const result = validateExpression(trimmed);
    if (!result.valid) return;

    void updateExpression(trimmed, mode, sampleRate);
  }, [mode, sampleRate, liveUpdateEnabled, isPlaying, expression, updateExpression, currentPost]);

  // On first load, prefill from URL (if present) or from localStorage draft.
  useEffect(() => {
    if (!router.isReady) return;

    if (typeof window === 'undefined') return;

    try {
      const { q } = router.query;
      const qStr = typeof q === 'string' ? q : undefined;

      if (qStr) {
        try {
          const decoded = atob(qStr);
          const parsed = JSON.parse(decoded) as {
            title?: string;
            expr?: string;
            mode?: ModeOption;
            sr?: number;
          } | null;

          if (parsed && typeof parsed.expr === 'string') {
            if (typeof parsed.title === 'string') {
              setTitle(parsed.title);
            }
            setExpression(parsed.expr);

            if (parsed.mode) {
              setMode(parsed.mode);
            }

            if (parsed.sr && !Number.isNaN(parsed.sr)) {
              setSampleRate(Math.min(Math.max(MIN_SAMPLE_RATE, parsed.sr), MAX_SAMPLE_RATE));
            }
            return;
          }
        } catch {
          // ignore malformed q param
        }
      }

      try {
        const raw = window.localStorage.getItem(CREATE_DRAFT_STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw) as {
          title?: string;
          description?: string;
          expression?: string;
          isDraft?: boolean;
          mode?: ModeOption;
          sampleRate?: number;
          license?: LicenseOption;
        } | null;

        if (!parsed) return;

        if (typeof parsed.title === 'string') setTitle(parsed.title);
        if (typeof parsed.description === 'string') setDescription(parsed.description);
        if (typeof parsed.expression === 'string') setExpression(parsed.expression);
        if (typeof parsed.isDraft === 'boolean') setIsDraft(parsed.isDraft);

        if (parsed.mode) setMode(parsed.mode);
        if (parsed.sampleRate) setSampleRate(parsed.sampleRate);
        if (parsed.license) setLicense(parsed.license);
      } catch (e) {
        console.error(e);
      }
    } finally {
      setDraftLoaded(true);
    }
  }, [router.isReady, router.query]);

  // Persist current editor state to localStorage so unauthenticated users
  // don't lose their work.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!draftLoaded) return;

    try {
      window.localStorage.setItem(
        CREATE_DRAFT_STORAGE_KEY,
        JSON.stringify({
          title,
          description,
          expression,
          isDraft,
          mode,
          sampleRate,
          license,
        }),
      );
    } catch (e) {
      console.error(e);
    }
  }, [title, description, expression, isDraft, mode, sampleRate, license, draftLoaded]);

  const onExpressionChange = (value: string) => {
    setExpression(value);
  };

  const handleModeChange = (newMode: ModeOption) => {
    setMode(newMode);
  };

  const handleSampleRateChange = (newRate: number) => {
    setSampleRate(newRate);
  };

  const handleLiveUpdateChange = (enabled: boolean) => {
    setLiveUpdateEnabled(enabled);
  };

  const handlePublish = () => {
    // TODO: Implement publish functionality
    console.log('Publish clicked from focus page');
  };

  return (
    <>
      <Head>
        <title>Create - BytebeatCloud</title>
        <meta name="description" content="Create a new bytebeat on BytebeatCloud" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Create - BytebeatCloud" />
        <meta property="og:description" content="Create a new bytebeat on BytebeatCloud" />
        <meta
          property="og:image"
          content={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/og/create${expression ? `?expr=${encodeURIComponent(expression)}` : ''}`}
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      {!isStateLoaded && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          color: 'white'
        }}>
          Loading...
        </div>
      )}
      <FocusLayout
        expression={expression}
        mode={mode}
        onModeChange={handleModeChange}
        sampleRate={sampleRate}
        onSampleRateChange={handleSampleRateChange}
        isPlaying={isPlaying}
        onPlayClick={handlePlayClick}
        liveUpdateEnabled={liveUpdateEnabled}
        onLiveUpdateChange={handleLiveUpdateChange}
        onPublish={handlePublish}
      >
        <section style={{ width: '100%', height: '100%', overflow: 'auto' }}>
          <FocusExpressionEditor value={expression} onChange={onExpressionChange} />
        </section>
      </FocusLayout>
    </>
  );
}

page.getLayout = (page) => page

export default page;