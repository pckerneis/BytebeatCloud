import { useRef, useState, type FormEvent } from 'react';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { supabase } from '../lib/supabaseClient';
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
  const [title, setTitle] = useState('');
  const [expression, setExpression] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [mode, setMode] = useState<ModeOption>(ModeOption.Float);
  const [sampleRate, setSampleRate] = useState<SampleRateOption>(SampleRateOption._44_1k);
  const { isPlaying, toggle, lastError } = useBytebeatPlayer();
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
    const result = validateExpression(expression);

    console.log(result);

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

    const { error } = await supabase.from('posts').insert({
      profile_id: (user as any).id,
      title: trimmedTitle,
      expression: trimmedExpr,
      is_draft: isDraft,
      sample_rate: sampleRateValue,
      mode: modeValue,
    });

    if (error) {
      setSaveError(error.message);
      setSaveStatus('idle');
      return;
    }

    setSaveStatus('success');
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

  return (
    <section>
      <h2>Create</h2>
      <form className="create-form" onSubmit={handleSubmit}>
        <label className="field">
          <input
            type="text"
            maxLength={TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="post-title-input"
            placeholder="Name your bytebeat expression"
          />
        </label>

        <div className="chips">
          <button
            className="option-chip"
            onClick={() => toggleMode()}
          >
            {mode}
          </button>
          <button
            className="option-chip"
            onClick={() => rotateSampleRate()}
          >
            {sampleRate}
          </button>
        </div>

        <label className="field">
          <textarea
            className="expression-input"
            value={expression}
            onChange={(e) => handleExpressionChange(e.target.value)}
            rows={8}
            placeholder="Type your bytebeat expression here"
          />
          <div className="field-footer">
            <button
              type="button"
              className="button secondary"
              disabled={!expression.trim() || !!validationIssue}
              onClick={handlePlayClick}
            >
              {isPlaying ? 'Stop' : 'Play'}
            </button>
            <span className={isExpressionTooLong ? 'counter error' : 'counter'}>
              {expressionLength} / {EXPRESSION_MAX}
            </span>
          </div>

          {validationIssue && (
            <div className="expression-preview">
              {validationIssue.message}
              <pre>
              <code>
                {expression.slice(0, validationIssue.start)}
                <span className="expr-highlight">
                  {expression.slice(validationIssue.start, validationIssue.end)}
                </span>
                {expression.slice(validationIssue.end)}
              </code>
            </pre>
            </div>
          )}
          {lastError ? <p className="error-message">{lastError}</p> : null}
        </label>

        <div className="form-actions">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={isDraft}
              onChange={(e) => setIsDraft(e.target.checked)}
            />
            <span>Save as draft</span>
          </label>

          <button
            type="submit"
            className="button primary"
            disabled={!expression.trim() || saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
        {saveError && <p className="error-message">{saveError}</p>}
        {saveStatus === 'success' && !saveError && (
          <p className="counter">Post saved.</p>
        )}
      </form>
    </section>
  );
}
