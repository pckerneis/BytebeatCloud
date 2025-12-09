import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../../hooks/usePlayerStore';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { supabase } from '../../lib/supabaseClient';
import { PostEditorFormFields } from '../../components/PostEditorFormFields';
import Head from 'next/head';
import { ModeOption, DEFAULT_SAMPLE_RATE } from '../../model/expression';
import { validateExpression } from '../../utils/expression-validator';
import { useExpressionPlayer } from '../../hooks/useExpressionPlayer';
import { convertMentionsToIds, convertMentionsToUsernames } from '../../utils/mentions';

export default function EditPostPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expression, setExpression] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [mode, setMode] = useState<ModeOption>(ModeOption.Float);
  const [sampleRate, setSampleRate] = useState<number>(DEFAULT_SAMPLE_RATE);
  const { isPlaying, toggle, lastError, stop, updateExpression } = useBytebeatPlayer({
    enableVisualizer: false,
  });
  const { currentPost, setCurrentPostById } = usePlayerStore();

  const { user } = useSupabaseAuth();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [liveUpdateEnabled, setLiveUpdateEnabled] = useState(true);

  const { validationIssue, handleExpressionChange, handlePlayClick, setValidationIssue } =
    useExpressionPlayer({
      expression,
      setExpression,
      mode,
      sampleRateValue: sampleRate,
      toggle,
      setCurrentPostById,
      loopPreview: false,
      isPlaying,
      liveUpdateEnabled,
      updateExpression,
    });

  useEffect(() => {
    return () => {
      // Only stop if the editor's preview is playing (no post selected)
      if (!currentPost) {
        void stop();
      }
    };
  }, [stop, currentPost]);

  useEffect(() => {
    if (!liveUpdateEnabled || !isPlaying) return;

    const trimmed = expression.trim();
    if (!trimmed) return;

    const result = validateExpression(trimmed);
    if (!result.valid) return;

    void updateExpression(trimmed, mode, sampleRate);
  }, [mode, sampleRate, liveUpdateEnabled, isPlaying, expression, updateExpression]);

  useEffect(() => {
    if (!id || typeof id !== 'string') return;

    let cancelled = false;

    const loadPost = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('posts')
        .select('title,description,expression,is_draft,sample_rate,mode,profile_id')
        .eq('id', id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
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

      // Convert @[userId] mentions back to @username for editing
      const { text: displayDescription } = await convertMentionsToUsernames(data.description ?? '');

      setTitle(data.title ?? '');
      setDescription(displayDescription);
      setExpression(data.expression ?? '');
      setIsDraft(Boolean(data.is_draft));
      setMode(data.mode);
      setSampleRate(data.sample_rate);

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
    const trimmedDescription = description.trim();

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

    // Convert @username mentions to @[userId] format for storage
    const storedDescription = await convertMentionsToIds(trimmedDescription || '');

    const { error } = await supabase
      .from('posts')
      .update({
        title: trimmedTitle,
        description: storedDescription,
        expression: trimmedExpr,
        is_draft: isDraft,
        sample_rate: sampleRate,
        mode,
      })
      .eq('id', id)
      .eq('profile_id', (user as any).id);

    if (error) {
      setSaveError(error.message);
      setSaveStatus('idle');
      return;
    }

    setSaveStatus('success');

    if (!isDraft) {
      await router.push(`/post/${id}`);
    }
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
        <meta name="description" content="Edit your bytebeat on BytebeatCloud" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Editing - BytebeatCloud" />
        <meta property="og:description" content="Edit your bytebeat on BytebeatCloud" />
        <meta property="og:image" content={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/og/edit/${id}`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
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
            showDeleteButton
            onDeleteClick={() => setShowDeleteConfirm(true)}
            showActions={!!user}
            isFork={false}
            liveUpdateEnabled={liveUpdateEnabled}
            onLiveUpdateChange={setLiveUpdateEnabled}
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
