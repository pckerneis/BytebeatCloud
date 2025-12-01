import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../../hooks/usePlayerStore';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { supabase } from '../../lib/supabaseClient';
import { PostEditorFormFields } from '../../components/PostEditorFormFields';
import Head from 'next/head';
import {
  getSampleRateValue,
  ModeOption,
  SampleRateOption,
  decodeMode,
  decodeSampleRate,
  encodeMode,
  encodeSampleRate,
} from '../../model/expression';
import { validateExpression } from '../../utils/expression-validator';
import { useExpressionPlayer } from '../../hooks/useExpressionPlayer';

export default function EditPostPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [expression, setExpression] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [mode, setMode] = useState<ModeOption>(ModeOption.Float);
  const [sampleRate, setSampleRate] = useState<SampleRateOption>(SampleRateOption._44_1k);
  const { isPlaying, toggle, lastError, stop } = useBytebeatPlayer({ enableVisualizer: false });
  const { setCurrentPostById } = usePlayerStore();
  const sr = getSampleRateValue(sampleRate);

  const { user } = useSupabaseAuth();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { validationIssue, handleExpressionChange, handlePlayClick, setValidationIssue } =
    useExpressionPlayer({
      expression,
      setExpression,
      mode,
      sampleRateValue: sr,
      toggle,
      setCurrentPostById,
    });

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  useEffect(() => {
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
      setMode(decodeMode(data.mode as any));
      setSampleRate(decodeSampleRate(data.sample_rate as any));

      setLoading(false);
    };

    void loadPost();

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

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

    const sampleRateValue = encodeSampleRate(sampleRate);
    const modeValue = encodeMode(mode);

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

  if (loading) {
    return (
      <section>
        <h2>Edit post</h2>
        <p>Loading…</p>
      </section>
    );
  }

  return (
    <>
      <Head>
        <title>BytebeatCloud - Edit post</title>
      </Head>
      <section>
        <button type="button" className="button ghost" onClick={() => router.back()}>
          ← Back
        </button>
        <h2>Edit post</h2>
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
            submitLabel={saveStatus === 'saving' ? 'Saving…' : 'Save changes'}
            showDeleteButton
            onDeleteClick={() => setShowDeleteConfirm(true)}
            showActions={!!user}
          />
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
    </>
  );
}
