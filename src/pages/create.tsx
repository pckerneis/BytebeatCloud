import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { supabase } from '../lib/supabaseClient';
import { PostEditorFormFields } from '../components/PostEditorFormFields';
import Head from 'next/head';
import {
  ModeOption,
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
  DEFAULT_SAMPLE_RATE,
} from '../model/expression';
import { validateExpression } from '../utils/expression-validator';
import { useExpressionPlayer } from '../hooks/useExpressionPlayer';
import { PostMetadataModel } from '../model/postEditor';

const CREATE_DRAFT_STORAGE_KEY = 'bytebeat-cloud-create-draft-v1';

export default function CreatePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expression, setExpression] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [mode, setMode] = useState<ModeOption>(ModeOption.Uint8);
  const [sampleRate, setSampleRate] = useState<number>(DEFAULT_SAMPLE_RATE);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const { isPlaying, toggle, lastError, stop, updateExpression } = useBytebeatPlayer({
    enableVisualizer: false,
  });
  const { setCurrentPostById } = usePlayerStore();

  const { user } = useSupabaseAuth();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');
  const [liveUpdateEnabled, setLiveUpdateEnabled] = useState(true);

  const { validationIssue, handleExpressionChange, handlePlayClick, setValidationIssue } =
    useExpressionPlayer({
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
    });

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  useEffect(() => {
    if (!liveUpdateEnabled || !isPlaying) return;

    const trimmed = expression.trim();
    if (!trimmed) return;

    const result = validateExpression(trimmed);
    if (!result.valid) return;

    void updateExpression(trimmed, mode, sampleRate);
  }, [mode, sampleRate, liveUpdateEnabled, isPlaying, expression, updateExpression]);

  // On first load, prefill from URL (if present) or from localStorage draft.
  useEffect(() => {
    if (!router.isReady) return;

    if (typeof window === 'undefined') return;

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
      } | null;

      if (!parsed) return;

      if (typeof parsed.title === 'string') setTitle(parsed.title);
      if (typeof parsed.description === 'string') setDescription(parsed.description);
      if (typeof parsed.expression === 'string') setExpression(parsed.expression);
      if (typeof parsed.isDraft === 'boolean') setIsDraft(parsed.isDraft);

      if (parsed.mode) setMode(parsed.mode);
      if (parsed.sampleRate) setSampleRate(parsed.sampleRate);
    } catch (e) {
      console.error(e);
    }

    setDraftLoaded(true);
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
        }),
      );
    } catch (e) {
      console.error(e);
    }
  }, [title, description, expression, isDraft, mode, sampleRate, draftLoaded]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedExpr = expression.trim();
    const trimmedDescription = description.trim();

    const result = validateExpression(trimmedExpr);
    if (!result.valid) {
      setValidationIssue(result.issues[0] ?? null);
      return;
    }

    if (!user) {
      setSaveError('You must be logged in to save a post.');
      return;
    }

    setSaveStatus('saving');
    setSaveError('');

    const { data, error } = await supabase
      .from('posts')
      .insert({
        profile_id: (user as any).id,
        title: trimmedTitle,
        description: trimmedDescription || null,
        expression: trimmedExpr,
        is_draft: isDraft,
        sample_rate: sampleRate,
        mode,
      })
      .select('id')
      .single();

    if (error || !data) {
      setSaveError(error ? error.message : 'Unknown error while saving post.');
      setSaveStatus('idle');
      return;
    }

    setSaveStatus('success');

    if (!isDraft) {
      window.localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
      await router.push(`/post/${data.id}`);
    }
  };

  const meta: PostMetadataModel = {
    title,
    description,
    mode,
    sampleRate,
    isDraft,
  };

  const handleMetaChange = (next: typeof meta) => {
    setTitle(next.title);
    setDescription(next.description);
    setMode(next.mode);
    setSampleRate(next.sampleRate);
    setIsDraft(next.isDraft);
  };

  return (
    <>
      <Head>
        <title>BytebeatCloud - Create</title>
      </Head>
      <section>
        <h2>Create</h2>
        {!user && (
          <p className="text-centered login-to-publish-message">
            <a href={'/login'}>Log in</a> to publish a post, or use a share link.
          </p>
        )}

        <form className="create-form" onSubmit={handleSubmit}>
          <PostEditorFormFields
            meta={meta}
            onMetaChange={handleMetaChange}
            expression={expression}
            onExpressionChange={handleExpressionChange}
            isPlaying={isPlaying}
            onPlayClick={handlePlayClick}
            validationIssue={validationIssue}
            lastError={lastError || null}
            saveStatus={saveStatus}
            saveError={saveError}
            submitLabel={saveStatus === 'saving' ? 'Saving…' : 'Save'}
            showActions={!!user}
            isFork={false}
            liveUpdateEnabled={liveUpdateEnabled}
            onLiveUpdateChange={setLiveUpdateEnabled}
          />
        </form>
      </section>
    </>
  );
}
