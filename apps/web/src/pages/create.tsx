import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
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

const TITLE_MAX = 64;
const EXPRESSION_MAX = 1024;

export default function CreatePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [expression, setExpression] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [mode, setMode] = useState<ModeOption>(ModeOption.Float);
  const [sampleRate, setSampleRate] = useState<SampleRateOption>(SampleRateOption._44_1k);
  const { isPlaying, toggle, lastError, stop } = useBytebeatPlayer();
  const sr = getSampleRateValue(sampleRate);

  const { user } = useSupabaseAuth();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');

  const [validationIssue, setValidationIssue] = useState<ValidationIssue | null>(null);
  const validationTimeoutRef = useRef<number | null>(null);

  const expressionLength = expression.length;

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

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return (
    <section>
      <h2>Create</h2>
      {!user ? (
        <p className="text-centered">You must be logged in to create a post.</p>
      ) : (
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
          />
        </form>
      )}
    </section>
  );
}
