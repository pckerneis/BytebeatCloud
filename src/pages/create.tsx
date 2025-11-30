import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { supabase } from '../lib/supabaseClient';
import { PostEditorFormFields } from '../components/PostEditorFormFields';
import Head from 'next/head';
import {
  getSampleRateValue,
  ModeOption,
  SampleRateOption,
  decodeMode,
  decodeSampleRate,
  encodeMode,
  encodeSampleRate,
} from '../model/expression';
import { validateExpression } from '../model/expression-validator';
import { useExpressionPlayer } from '../hooks/useExpressionPlayer';

const CREATE_DRAFT_STORAGE_KEY = 'bitejam-create-draft-v1';

export default function CreatePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [expression, setExpression] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [mode, setMode] = useState<ModeOption>(ModeOption.Float);
  const [sampleRate, setSampleRate] = useState<SampleRateOption>(SampleRateOption._44_1k);
  const { isPlaying, toggle, lastError, stop } = useBytebeatPlayer();
  const { setCurrentPostById } = usePlayerStore();
  const sr = getSampleRateValue(sampleRate);

  const { user } = useSupabaseAuth();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');

  const { validationIssue, handleExpressionChange, handlePlayClick, setValidationIssue } =
    useExpressionPlayer({
      expression,
      setExpression,
      mode,
      sampleRateValue: sr,
      toggle,
      setCurrentPostById,
      loopPreview: true,
    });

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

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
          mode?: 'int' | 'float';
          sr?: '8k' | '16k' | '44.1k';
        } | null;

        if (parsed && typeof parsed.expr === 'string') {
          if (typeof parsed.title === 'string') {
            setTitle(parsed.title);
          }
          setExpression(parsed.expr);

          if (parsed.mode) {
            setMode(decodeMode(parsed.mode));
          }

          if (parsed.sr) {
            setSampleRate(decodeSampleRate(parsed.sr));
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
        expression?: string;
        isDraft?: boolean;
        mode?: 'int' | 'float';
        sampleRate?: '8k' | '16k' | '44.1k';
      } | null;

      if (!parsed) return;

      if (typeof parsed.title === 'string') setTitle(parsed.title);
      if (typeof parsed.expression === 'string') setExpression(parsed.expression);
      if (typeof parsed.isDraft === 'boolean') setIsDraft(parsed.isDraft);

      if (parsed.mode) setMode(decodeMode(parsed.mode));
      if (parsed.sampleRate) setSampleRate(decodeSampleRate(parsed.sampleRate));
    } catch {
      // ignore malformed localStorage
    }
  }, [router.isReady, router.query]);

  // Persist current editor state to localStorage so unauthenticated users
  // don't lose their work.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const sampleRateValue = encodeSampleRate(sampleRate);
      const modeValue = encodeMode(mode);

      window.localStorage.setItem(
        CREATE_DRAFT_STORAGE_KEY,
        JSON.stringify({
          title,
          expression,
          isDraft,
          mode: modeValue,
          sampleRate: sampleRateValue,
        }),
      );
    } catch {
      // ignore storage errors
    }
  }, [title, expression, isDraft, mode, sampleRate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedExpr = expression.trim();

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

    const sampleRateValue = encodeSampleRate(sampleRate);
    const modeValue = encodeMode(mode);

    const { data, error } = await supabase
      .from('posts')
      .insert({
        profile_id: (user as any).id,
        title: trimmedTitle,
        expression: trimmedExpr,
        is_draft: isDraft,
        sample_rate: sampleRateValue,
        mode: modeValue,
      })
      .select('id')
      .single();

    if (error || !data) {
      setSaveError(error ? error.message : 'Unknown error while saving post.');
      setSaveStatus('idle');
      return;
    }

    await router.push(`/post/${data.id}`);
  };

  const meta = {
    title,
    mode,
    sampleRate,
    isDraft,
  };

  const handleMetaChange = (next: typeof meta) => {
    setTitle(next.title);
    setMode(next.mode);
    setSampleRate(next.sampleRate);
    setIsDraft(next.isDraft);
  };

  return (
    <>
      <Head>
        <title>ByteJam - Create</title>
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
          />
        </form>
      </section>
    </>
  );
}
