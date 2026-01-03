import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../../hooks/usePlayerStore';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { supabase } from '../../lib/supabaseClient';
import { PostEditorFormFields } from '../../components/PostEditorFormFields';
import Head from 'next/head';
import {
  ModeOption,
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
  DEFAULT_SAMPLE_RATE,
} from '../../model/expression';
import { validateExpression } from '../../utils/expression-validator';
import { useExpressionPlayer } from '../../hooks/useExpressionPlayer';
import { useCtrlSpacePlayShortcut } from '../../hooks/useCtrlSpacePlayShortcut';
import { PostMetadataModel, LicenseOption, DEFAULT_LICENSE } from '../../model/postEditor';
import { convertMentionsToIds } from '../../utils/mentions';
import Link from 'next/link';
import { useCurrentWeeklyChallenge } from '../../hooks/useCurrentWeeklyChallenge';
import { FocusLayout } from '../../components/FocusLayout';
import { NextPageWithLayout } from '../_app';
import { ExpressionEditor } from '../../components/ExpressionEditor';
import { FocusExpressionEditor } from '../../components/FocusExpressionEditor';

const CREATE_DRAFT_STORAGE_KEY = 'bytebeat-cloud-create-draft-v1';

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
  const { isPlaying, toggle, lastError, stop, updateExpression } = useBytebeatPlayer({
    enableVisualizer: false,
  });
  const { currentPost, setCurrentPostById } = usePlayerStore();

  const { user } = useSupabaseAuth();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');
  const [liveUpdateEnabled, setLiveUpdateEnabled] = useState(true);
  const { weekNumber: currentWeekNumber, theme: currentTheme } = useCurrentWeeklyChallenge();
  const [hasWeeklySubmission, setHasWeeklySubmission] = useState(false);

  const {
    validationIssue,
    handleExpressionChange,
    handlePlayClick: handlePlayClickBase,
    setValidationIssue,
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

  // Check if user already has a submission for current week
  useEffect(() => {
    const checkWeeklySubmission = async () => {
      if (!user || currentWeekNumber === null) {
        setHasWeeklySubmission(false);
        return;
      }

      const weekTag = `#week${currentWeekNumber}`;
      const { data, error } = await supabase
        .from('posts')
        .select('id')
        .eq('profile_id', (user as any).id)
        .eq('is_draft', false)
        .or(`title.ilike.%${weekTag}%,description.ilike.%${weekTag}%`)
        .limit(1);

      if (!error && data && data.length > 0) {
        setHasWeeklySubmission(true);
      } else {
        setHasWeeklySubmission(false);
      }
    };

    void checkWeeklySubmission();
  }, [user, currentWeekNumber]);

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

  useEffect(() => {
    if (!router.isReady) return;
    if (!draftLoaded) return;
    if (!user) return;

    const hasWeeklyParam = Object.prototype.hasOwnProperty.call(router.query, 'weekly');

    if (!hasWeeklyParam) return;
    if (currentWeekNumber === null) return;

    const weekTag = `#week${currentWeekNumber}`;
    const hasExactWeekTag = new RegExp(`(^|\\s)${weekTag}(?!\\w)`).test(description);

    if (!hasExactWeekTag) {
      setDescription(
        `Submission for ${weekTag} challenge` + (description.trim() ? `\n${description}` : ''),
      );
    }
  }, [router.isReady, router.query, draftLoaded, description, user, currentWeekNumber]);

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

  const onExpressionChange = () => {};

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
      <section style={{ width: '100%', height: '100%', overflow: 'auto' }}>
        <FocusExpressionEditor value={expression} onChange={onExpressionChange} />
      </section>
    </>
  );
}

page.getLayout = (page) => (<FocusLayout>{page}</FocusLayout>)

export default page;