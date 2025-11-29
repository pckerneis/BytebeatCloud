import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../../hooks/useBytebeatPlayer';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { supabase } from '../../lib/supabaseClient';
import { ExpressionEditor, ExpressionErrorSnippet } from '../../components/ExpressionEditor';
import {
  getSampleRateValue,
  ModeOption,
  SampleRateOption,
  validateExpression,
  type ValidationIssue,
} from 'shared';

const TITLE_MAX = 64;
const EXPRESSION_MAX = 1024;

export default function EditPostPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [expression, setExpression] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [mode, setMode] = useState<ModeOption>(ModeOption.Float);
  const [sampleRate, setSampleRate] = useState<SampleRateOption>(
    SampleRateOption._44_1k,
  );

  const { isPlaying, toggle, lastError, stop } = useBytebeatPlayer();
  const sr = getSampleRateValue(sampleRate);

  const { user } = useSupabaseAuth();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [validationIssue, setValidationIssue] = useState<ValidationIssue | null>(null);
  const validationTimeoutRef = useRef<number | null>(null);

  const expressionLength = expression.length;

  useEffect(() => {
    if (!supabase) return;
    if (!id || typeof id !== 'string') return;

    let cancelled = false;

    const loadPost = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('posts')
        .select('title,expression,is_draft,sample_rate,mode,profile_id')
        .eq('id', id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        // eslint-disable-next-line no-console
        console.warn('Error loading post', error.message);
        setSaveError('Unable to load post.');
        setLoading(false);
        return;
      }

      if (!data) {
        setSaveError('Post not found.');
        setLoading(false);
        return;
      }

      // Rely on RLS to restrict access but also guard on client side
      if (user && data.profile_id && data.profile_id !== (user as any).id) {
        setSaveError('You do not have permission to edit this post.');
        setLoading(false);
        return;
      }

      setTitle(data.title ?? '');
      setExpression(data.expression ?? '');
      setIsDraft(Boolean(data.is_draft));
      setMode(data.mode === 'int' ? ModeOption.Int : ModeOption.Float);
      setSampleRate(
        data.sample_rate === '8k'
          ? SampleRateOption._8k
          : data.sample_rate === '16k'
            ? SampleRateOption._16k
            : SampleRateOption._44_1k,
      );

      setLoading(false);
    };

    void loadPost();

    return () => {
      cancelled = true;
    };
  }, [id, user]);

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
    if (!id || typeof id !== 'string') return;

    const trimmedTitle = title.trim();
    const trimmedExpr = expression.trim();

    const result = validateExpression(trimmedExpr);
    if (!result.valid) {
      setValidationIssue(result.issues[0] ?? null);
      return;
    }

    if (!user) {
      setSaveError('You must be logged in to edit a post.');
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

    const { error } = await supabase
      .from('posts')
      .update({
        title: trimmedTitle,
        expression: trimmedExpr,
        is_draft: isDraft,
        sample_rate: sampleRateValue,
        mode: modeValue,
      })
      .eq('id', id)
      .eq('profile_id', (user as any).id);

    if (error) {
      setSaveError(error.message);
      setSaveStatus('idle');
      return;
    }

    setSaveStatus('success');
  };

  const handleDelete = async () => {
    if (!supabase) return;
    if (!id || typeof id !== 'string') return;

    if (!user) {
      setSaveError('You must be logged in to delete a post.');
      return;
    }

    setSaveStatus('saving');
    setSaveError('');

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', id)
      .eq('profile_id', (user as any).id);

    if (error) {
      setSaveError(error.message);
      setSaveStatus('idle');
      return;
    }

    await router.push('/profile');
  };

  const isExpressionTooLong = expressionLength > EXPRESSION_MAX;

  const toggleMode = () => {
    if (mode === ModeOption.Int) {
      setMode(ModeOption.Float);
    } else {
      setMode(ModeOption.Int);
    }
  };

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

  if (loading) {
    return (
      <section>
        <h2>Edit post</h2>
        <p>Loading…</p>
      </section>
    );
  }

  return (
    <section>
      <button
        type="button"
        className="button ghost"
        onClick={() => router.back()}
      >
        ← Back
      </button>
      <h2>Edit post</h2>
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
            type="button"
            className="option-chip"
            onClick={() => toggleMode()}
          >
            {mode}
          </button>
          <button
            type="button"
            className="option-chip"
            onClick={() => rotateSampleRate()}
          >
            {sampleRate}
          </button>
        </div>

        <div className="expression-input">
          <ExpressionEditor
            value={expression}
            onChange={handleExpressionChange}
          />
        </div>
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
            <ExpressionErrorSnippet expression={expression} issue={validationIssue} />
          </div>
        )}
        {lastError ? <p className="error-message">{lastError}</p> : null}

        <div className="form-actions">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={isDraft}
              onChange={(e) => setIsDraft(e.target.checked)}
            />
            <span>Save as draft</span>
          </label>

          <div className="form-actions-buttons">
            <button
              type="button"
              className="button danger"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saveStatus === 'saving'}
            >
              Delete
            </button>

            <button
              type="submit"
              className="button primary"
              disabled={!expression.trim() || saveStatus === 'saving'}
            >
              {saveStatus === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
        {saveError && <p className="error-message">{saveError}</p>}
        {saveStatus === 'success' && !saveError && (
          <p className="counter">Post updated.</p>
        )}
      </form>

      {showDeleteConfirm && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Delete post</h3>
            <p>Are you sure you want to delete this post permanently?</p>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={saveStatus === 'saving'}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => void handleDelete()}
                disabled={saveStatus === 'saving'}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
