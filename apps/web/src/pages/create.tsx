import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { supabase } from '../lib/supabaseClient';
import { PostEditorFormFields } from '../components/PostEditorFormFields';
import {
  getSampleRateValue,
  ModeOption,
  SampleRateOption,
  validateExpression,
  type ValidationIssue,
} from 'shared';

const EXPRESSION_MAX = 1024;
const CREATE_DRAFT_STORAGE_KEY = 'bitebeats-create-draft-v1';

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

  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  const [validationIssue, setValidationIssue] = useState<ValidationIssue | null>(null);
  const validationTimeoutRef = useRef<number | null>(null);

  const expressionLength = expression.length;

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

          if (parsed.mode === 'int') {
            setMode(ModeOption.Int);
          } else if (parsed.mode === 'float') {
            setMode(ModeOption.Float);
          }

          if (parsed.sr === '8k') {
            setSampleRate(SampleRateOption._8k);
          } else if (parsed.sr === '16k') {
            setSampleRate(SampleRateOption._16k);
          } else if (parsed.sr === '44.1k') {
            setSampleRate(SampleRateOption._44_1k);
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

      if (parsed.mode === 'int') setMode(ModeOption.Int);
      else if (parsed.mode === 'float') setMode(ModeOption.Float);

      if (parsed.sampleRate === '8k') setSampleRate(SampleRateOption._8k);
      else if (parsed.sampleRate === '16k') setSampleRate(SampleRateOption._16k);
      else if (parsed.sampleRate === '44.1k') setSampleRate(SampleRateOption._44_1k);
    } catch {
      // ignore malformed localStorage
    }
  }, [router.isReady, router.query]);

  // Persist current editor state to localStorage so unauthenticated users
  // don't lose their work.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const sampleRateValue =
        sampleRate === SampleRateOption._8k
          ? '8k'
          : sampleRate === SampleRateOption._16k
            ? '16k'
            : '44.1k';

      const modeValue = mode === ModeOption.Float ? 'float' : 'int';

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

  const handleExpressionChange = (value: string) => {
    setExpression(value);

    const trimmed = value.trim();
    if (!trimmed) {
      setValidationIssue(null);
      return;
    }

    if (validationTimeoutRef.current !== null) {
      window.clearTimeout(validationTimeoutRef.current);
    }

    validationTimeoutRef.current = window.setTimeout(() => {
      const result = validateExpression(value);
      setValidationIssue(result.valid ? null : result.issues[0] ?? null);
    }, 200);
  };

  const handlePlayClick = () => {
    const trimmed = expression.trim();
    if (!trimmed) {
      setValidationIssue(null);
      return;
    }

    const result = validateExpression(expression);

    if (!result.valid) {
      setValidationIssue(result.issues[0] ?? null);
      return;
    }

    setValidationIssue(null);
    // Clear any globally selected post while previewing an ad-hoc expression.
    setCurrentPostById(null);
    void toggle(expression, mode, sr, true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!supabase) return;

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

    const sampleRateValue =
      sampleRate === SampleRateOption._8k
        ? '8k'
        : sampleRate === SampleRateOption._16k
        ? '16k'
        : '44.1k';

    const modeValue = mode === ModeOption.Float ? 'float' : 'int';

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

  const isExpressionTooLong = expressionLength > EXPRESSION_MAX;

  const toggleMode = () => {
    if (mode === ModeOption.Int) {
      setMode(ModeOption.Float);
    } else {
      setMode(ModeOption.Int);
    }
  }
  
  const rotateSampleRate = () => {
    switch (sampleRate) {
      case SampleRateOption._44_1k:
        setSampleRate(SampleRateOption._8k);
        break;
      case SampleRateOption._8k:
        setSampleRate(SampleRateOption._16k);
        break;
      case SampleRateOption._16k:
        setSampleRate(SampleRateOption._44_1k);
        break;
    }
  };

  const handleCopyShareLink = async () => {
    const trimmedExpr = expression.trim();
    if (!trimmedExpr) return;

    if (typeof window === 'undefined') return;

    const trimmedTitle = title.trim();

    const sampleRateValue =
      sampleRate === SampleRateOption._8k
        ? '8k'
        : sampleRate === SampleRateOption._16k
          ? '16k'
          : '44.1k';

    const modeValue = mode === ModeOption.Float ? 'float' : 'int';

    const payload = {
      title: trimmedTitle || undefined,
      expr: trimmedExpr,
      mode: modeValue,
      sr: sampleRateValue,
    };

    let encoded = '';
    try {
      encoded = btoa(JSON.stringify(payload));
    } catch {
      return;
    }

    const origin = window.location.origin;
    const href = `${origin}/create?q=${encodeURIComponent(encoded)}`;

    try {
      await navigator.clipboard.writeText(href);
      setShareLinkCopied(true);
      window.setTimeout(() => setShareLinkCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <section>
      <h2>Create</h2>
      {!user && (
        <p className="text-centered login-to-publish-message">
          <a href={'/login'}>Log in</a> to publish a post, or use a share link.
        </p>
      )}

      <form className="create-form" onSubmit={handleSubmit}>
        <PostEditorFormFields
          title={title}
          onTitleChange={setTitle}
          expression={expression}
          onExpressionChange={handleExpressionChange}
          mode={mode}
          sampleRate={sampleRate}
          onToggleMode={toggleMode}
          onRotateSampleRate={rotateSampleRate}
          isDraft={isDraft}
          onDraftChange={setIsDraft}
          isPlaying={isPlaying}
          onPlayClick={handlePlayClick}
          validationIssue={validationIssue}
          lastError={lastError || null}
          isExpressionTooLong={isExpressionTooLong}
          expressionLength={expressionLength}
          expressionMax={EXPRESSION_MAX}
          saveStatus={saveStatus}
          saveError={saveError}
          submitLabel={saveStatus === 'saving' ? 'Saving…' : 'Save'}
          showActions={!!user}
        />

        <div className="form-actions-buttons" style={{ marginTop: '8px' }}>
          <button
            type="button"
            className="button secondary"
            disabled={!expression.trim()}
            onClick={handleCopyShareLink}
          >
            {shareLinkCopied ? 'Link copied' : 'Copy share link'}
          </button>
        </div>
      </form>
    </section>
  );
}
