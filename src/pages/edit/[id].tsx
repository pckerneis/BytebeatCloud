import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../../hooks/usePlayerStore';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { supabase } from '../../lib/supabaseClient';
import { PostEditorFormFields } from '../../components/PostEditorFormFields';
import Head from 'next/head';
import { ModeOption, DEFAULT_SAMPLE_RATE } from '../../model/expression';
import { LicenseOption, DEFAULT_LICENSE } from '../../model/postEditor';
import { validateExpression } from '../../utils/expression-validator';
import { useExpressionPlayer } from '../../hooks/useExpressionPlayer';
import { useCtrlSpacePlayShortcut } from '../../hooks/useCtrlSpacePlayShortcut';
import { convertMentionsToIds, convertMentionsToUsernames } from '../../utils/mentions';
import { TooltipHint } from '../../components/TooltipHint';
import { useFocusModeShortcut } from '../../hooks/useFocusModeShortcut';

export default function EditPostPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expression, setExpression] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [mode, setMode] = useState<ModeOption>(ModeOption.Float);
  const [sampleRate, setSampleRate] = useState<number>(DEFAULT_SAMPLE_RATE);
  const [license, setLicense] = useState<LicenseOption>(DEFAULT_LICENSE);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const { isPlaying, toggle, lastError, stop, updateExpression } = useBytebeatPlayer({
    enableVisualizer: false,
  });
  const { currentPost, setCurrentPostById } = usePlayerStore();

  const { user, loading: authLoading } = useSupabaseAuth();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');
  const [originalTitle, setOriginalTitle] = useState<string>('');
  const [originalDescription, setOriginalDescription] = useState<string | null>(null);
  const [originalExpression, setOriginalExpression] = useState<string | null>(null);
  const [originalMode, setOriginalMode] = useState<string | null>(null);
  const [originalSampleRate, setOriginalSampleRate] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [liveUpdateEnabled, setLiveUpdateEnabled] = useState(true);

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
    loopPreview: false,
    isPlaying,
    liveUpdateEnabled,
    updateExpression,
    currentPost,
  });

  const handlePlayClick = () => handlePlayClickBase(currentPost);

  // Save to localStorage whenever state changes
  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    if (loading) return;

    const draftKey = `edit-draft-${id}`;
    const draft = {
      title,
      description,
      expression,
      mode,
      sampleRate,
      license,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch (error) {
      console.error('Failed to save draft to localStorage:', error);
    }
  }, [id, title, description, expression, mode, sampleRate, license, loading]);

  useEffect(() => {
    if (!router.isReady) return;
    if (authLoading) return;

    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadError('You must be logged in to edit a post.');
      setLoading(false);
    }
  }, [router.isReady, authLoading, user, router]);

  useEffect(() => {
    return () => {
      // Only stop if the editor's preview is playing (no post selected)
      if (!currentPost) {
        void stop();
      }
    };
  }, [stop, currentPost]);

  useCtrlSpacePlayShortcut(handlePlayClick);
  useFocusModeShortcut();

  useEffect(() => {
    // Only apply live updates when no post is playing (editor's expression is playing)
    if (!liveUpdateEnabled || !isPlaying || currentPost) return;

    const trimmed = expression.trim();
    if (!trimmed) return;

    const result = validateExpression(trimmed);
    if (!result.valid) return;

    void updateExpression(trimmed, mode, sampleRate);
  }, [mode, sampleRate, liveUpdateEnabled, isPlaying, expression, updateExpression, currentPost]);

  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    if (authLoading) return;
    if (!user) return;

    let cancelled = false;

    const loadPost = async () => {
      setLoading(true);
      setLoadError('');

      const { data, error } = await supabase
        .from('posts')
        .select(
          'title,description,expression,is_draft,sample_rate,mode,profile_id,license,published_at',
        )
        .eq('id', id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn('Error loading post', error.message);
        setLoadError('Unable to load post.');
        setLoading(false);
        return;
      }

      if (!data) {
        setLoadError('Post not found.');
        setLoading(false);
        return;
      }

      // Rely on RLS to restrict access but also guard on client side
      if (data.profile_id && data.profile_id !== (user as any).id) {
        setLoadError('You do not have permission to edit this post.');
        setLoading(false);
        return;
      }

      // Convert @[userId] mentions back to @username for editing
      const { text: displayDescription } = await convertMentionsToUsernames(data.description ?? '');

      setTitle(data.title ?? '');
      setOriginalTitle(data.title ?? '');
      setDescription(displayDescription);
      setOriginalDescription(displayDescription);
      setExpression(data.expression ?? '');
      setOriginalExpression(data.expression ?? '');
      setIsDraft(Boolean(data.is_draft));
      setMode(data.mode);
      setOriginalMode(data.mode);
      setSampleRate(data.sample_rate);
      setOriginalSampleRate(data.sample_rate);
      setLicense(data.license ?? DEFAULT_LICENSE);
      setPublishedAt(data.published_at ?? null);

      // After loading server data, check for localStorage override
      const draftKey = `edit-draft-${id}`;
      try {
        const stored = localStorage.getItem(draftKey);
        if (stored) {
          const draft = JSON.parse(stored);
          // Only load if draft is less than 7 days old
          const age = Date.now() - (draft.timestamp || 0);
          const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
          
          if (age < maxAge) {
            // Override server data with local changes
            setTitle(draft.title || '');
            setDescription(draft.description || '');
            setExpression(draft.expression || '');
            setMode(draft.mode || ModeOption.Float);
            setSampleRate(draft.sampleRate || DEFAULT_SAMPLE_RATE);
            setLicense(draft.license || DEFAULT_LICENSE);
          } else {
            // Clean up old draft
            localStorage.removeItem(draftKey);
          }
        }
      } catch (error) {
        console.error('Failed to load draft from localStorage:', error);
      }

      setLoading(false);
    };

    void loadPost();

    return () => {
      cancelled = true;
    };
  }, [id, user, authLoading]);

  const savePost = async (asDraft: boolean) => {
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

    setIsDraft(asDraft);
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
        is_draft: asDraft,
        sample_rate: sampleRate,
        mode,
        license,
      })
      .eq('id', id)
      .eq('profile_id', (user as any).id);

    if (error) {
      setSaveError(error.message);
      setSaveStatus('idle');
      return;
    }

    setSaveStatus('success');

    // Clear localStorage draft on successful save
    if (id && typeof id === 'string') {
      try {
        localStorage.removeItem(`edit-draft-${id}`);
      } catch (error) {
        console.error('Failed to clear draft from localStorage:', error);
      }
    }

    if (!asDraft) {
      await router.push(`/post/${id}`);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await savePost(false);
  };

  const handleSaveAsDraft = () => {
    void savePost(true);
  };

  const handlePublish = () => {
    void savePost(false);
  };

  const handleDiscardChanges = async () => {
    if (id && typeof id === 'string') {
      // Clear localStorage
      try {
        localStorage.removeItem(`edit-draft-${id}`);
      } catch (error) {
        console.error('Failed to clear draft from localStorage:', error);
      }
    }

    // Reset dirty flag and reload
    setShowDiscardConfirm(false);
    
    // Trigger reload by clearing the last loaded ref
    // The useEffect will reload the post from server
    window.location.reload();
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
    license,
  };

  const handleMetaChange = (next: typeof meta) => {
    setTitle(next.title);
    setDescription(next.description);
    setMode(next.mode);
    setSampleRate(next.sampleRate);
    setIsDraft(next.isDraft);
    setLicense(next.license);
  };

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    if (id && typeof id === 'string') {
      void router.push(`/post/${id}`);
      return;
    }

    void router.push('/');
  };

  if (authLoading || loading) {
    return (
      <section>
        <button type="button" className="button ghost" onClick={handleBack}>
          ← Back
        </button>
        <h2>Edit post</h2>
        <p>Loading…</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section>
        <button type="button" className="button ghost" onClick={handleBack}>
          ← Back
        </button>
        <h2>Edit post</h2>
        <p className="error-message">{loadError}</p>
      </section>
    );
  }

  const hasUnsavedChanges =
    title !== originalTitle
      || expression !== originalExpression
      || mode !== originalMode
      || sampleRate !== originalSampleRate
      || description !== originalDescription;

  console.log({
    title,
    originalTitle,
    expression,
    originalExpression,
    mode,
    originalMode,
    sampleRate,
    originalSampleRate,
    description, originalDescription
  })

  return (
    <>
      <Head>
        <title>Edit post - BytebeatCloud</title>
        <meta name="description" content="Edit your bytebeat on BytebeatCloud" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Editing - BytebeatCloud" />
        <meta property="og:description" content="Edit your bytebeat on BytebeatCloud" />
        <meta
          property="og:image"
          content={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/og/edit/${id}`}
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <section>
        <button type="button" className="button ghost" onClick={handleBack}>
          ← Back
        </button>
        <h2>Edit post</h2>
        {isDraft && (
          <div className="info-panel">
            <span>
              You&apos;re editing a draft. The post won&apos;t be visible to anyone until you
              publish it.
            </span>
          </div>
        )}
        <form className="create-form" onSubmit={handleSubmit}>
          <div className="flex-row justify-content-end mb-8">
            <TooltipHint
              className="ml-auto"
              storageKey="enter-focus-mode-edit"
              content="Distraction-free editor. Your work is preserved."
              placement="bottom"
            >
              <button
                type="button"
                className="button secondary ghost small ml-auto"
                onClick={() => void router.push(`/edit/${id}/focus`)}
                title='Enter focus mode (Ctrl+Shift+F)'
              >
                ⛶ Enter Focus Mode
              </button>
            </TooltipHint>
          </div>
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
            onSaveAsDraft={handleSaveAsDraft}
            showDiscardChangesButton={true}
            hasUnsavedChanges={hasUnsavedChanges}
            onDiscardChangesClick={() => setShowDiscardConfirm(true)}
            onUnpublish={() => setShowUnpublishConfirm(true)}
            isEditMode={true}
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

        {showUnpublishConfirm && (
          <div className="modal-backdrop">
            <div className="modal">
              <h3>Unpublish post</h3>
              <p>This public post will be made private and visible only to you.</p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowUnpublishConfirm(false)}
                  disabled={saveStatus === 'saving'}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    setShowUnpublishConfirm(false);
                    handleSaveAsDraft();
                  }}
                  disabled={saveStatus === 'saving'}
                >
                  Unpublish
                </button>
              </div>
            </div>
          </div>
        )}

        {showDiscardConfirm && (
          <div className="modal-backdrop">
            <div className="modal">
              <h3>Discard changes</h3>
              <p>
                Your local changes will be discarded and the original post will be reloaded. This
                cannot be undone.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowDiscardConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button danger"
                  onClick={() => void handleDiscardChanges()}
                >
                  Discard changes
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
