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
import { formatPostTitle } from '../../utils/post-format';
import { TooltipHint } from '../../components/TooltipHint';
import { useFocusModeShortcut } from '../../hooks/useFocusModeShortcut';

export default function ForkPostPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expression, setExpression] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [mode, setMode] = useState<ModeOption>(ModeOption.Float);
  const [sampleRate, setSampleRate] = useState<number>(DEFAULT_SAMPLE_RATE);
  const [license, setLicense] = useState<LicenseOption>(DEFAULT_LICENSE);
  const { isPlaying, toggle, lastError, stop, updateExpression } = useBytebeatPlayer({
    enableVisualizer: false,
  });
  const { currentPost, setCurrentPostById } = usePlayerStore();

  const { user } = useSupabaseAuth();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');
  const [originalTitle, setOriginalTitle] = useState<string>('');
  const [originalAuthor, setOriginalAuthor] = useState<string | null>(null);
  const [originalDescription, setOriginalDescription] = useState<string | null>(null);
  const [originalExpression, setOriginalExpression] = useState<string | null>(null);
  const [originalMode, setOriginalMode] = useState<string | null>(null);
  const [originalSampleRate, setOriginalSampleRate] = useState<number | null>(null);
  const [isShareAlike, setIsShareAlike] = useState(false);
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

    const draftKey = `fork-draft-${id}`;
    const draft = {
      title,
      description,
      expression,
      mode,
      sampleRate,
      license,
      timestamp: Date.now(),
    };

    console.log('about to save draft', draft);

    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch (error) {
      console.error('Failed to save draft to localStorage:', error);
    }
  }, [id, title, description, expression, mode, sampleRate, license, loading]);

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

    let cancelled = false;

    const loadPost = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('posts')
        .select('title,description,expression,is_draft,sample_rate,mode,license,profiles(username)')
        .eq('id', id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn('Error loading post to fork', error.message);
        setSaveError('Unable to load post to fork.');
        setLoading(false);
        return;
      }

      if (!data) {
        setSaveError('Post not found.');
        setLoading(false);
        return;
      }

      // Block forking posts with all-rights-reserved license
      if (data.license === 'all-rights-reserved') {
        setSaveError('This post is all rights reserved and cannot be forked.');
        setLoading(false);
        return;
      }

      // If original post is share-alike, fork must also be share-alike
      const originalIsShareAlike = data.license === 'cc-by-sa';
      setIsShareAlike(originalIsShareAlike);

      const baseTitle = data.title ?? '';
      setOriginalTitle(baseTitle);
      setOriginalAuthor((data as any).profiles?.username ?? null);

      // Convert @[userId] mentions back to @username for editing
      const { text: displayDescription } = await convertMentionsToUsernames(data.description ?? '');

      setTitle(baseTitle ?? '');
      setDescription(displayDescription);
      setOriginalDescription(displayDescription);
      setExpression(data.expression ?? '');
      setOriginalExpression(data.expression ?? '');
      setIsDraft(Boolean(data.is_draft));
      setMode(data.mode);
      setOriginalMode(data.mode);
      setSampleRate(data.sample_rate);
      setOriginalSampleRate(data.sample_rate);
      // Set license to share-alike if original is share-alike, otherwise use default
      setLicense(originalIsShareAlike ? 'cc-by-sa' : DEFAULT_LICENSE);

      // After loading server data, check for localStorage override
      const draftKey = `fork-draft-${id}`;
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
  }, [id]);

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
      setSaveError('You must be logged in to save a fork.');
      return;
    }

    setIsDraft(asDraft);
    setSaveStatus('saving');
    setSaveError('');

    // Convert @username mentions to @[userId] format for storage
    const storedDescription = await convertMentionsToIds(trimmedDescription || '');

    const { data, error } = await supabase
      .from('posts')
      .insert({
        profile_id: (user as any).id,
        title: trimmedTitle,
        description: storedDescription,
        expression: trimmedExpr,
        is_draft: asDraft,
        sample_rate: sampleRate,
        mode,
        license,
        fork_of_post_id: id,
        is_fork: true,
      })
      .select('id')
      .single();

    if (error || !data) {
      setSaveError(error ? error.message : 'Unknown error while saving fork.');
      setSaveStatus('idle');
      return;
    }

    setSaveStatus('success');

    // Clear localStorage draft on successful save
    if (id && typeof id === 'string') {
      try {
        localStorage.removeItem(`fork-draft-${id}`);
      } catch (error) {
        console.error('Failed to clear draft from localStorage:', error);
      }
    }

    if (asDraft) {
      await router.push(`/edit/${data.id}`);
    } else {
      await router.push(`/post/${data.id}`);
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
        localStorage.removeItem(`fork-draft-${id}`);
      } catch (error) {
        console.error('Failed to clear draft from localStorage:', error);
      }
    }

    setShowDiscardConfirm(false);
    
    // Trigger reload by clearing the last loaded ref
    // The useEffect will reload the post from server
    window.location.reload();
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
    // Only allow license change if not forking a share-alike post
    if (!isShareAlike) {
      setLicense(next.license);
    }
  };

  const hasUnsavedChanges =
    title !== originalTitle
  || expression !== originalExpression
  || mode !== originalMode
  || sampleRate !== originalSampleRate
  || description !== originalDescription;

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

  if (loading) {
    return (
      <section>
        <button type="button" className="button ghost" onClick={handleBack}>
          ← Back
        </button>
        <h2>Fork post</h2>
        <p>Loading…</p>
      </section>
    );
  }

  return (
    <>
      <Head>
        <title>Fork post - BytebeatCloud</title>
        <meta name="description" content="Fork a bytebeat on BytebeatCloud" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Forking - BytebeatCloud" />
        <meta property="og:description" content="Fork a bytebeat on BytebeatCloud" />
        <meta
          property="og:image"
          content={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/og/fork/${id}`}
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <section>
        <button type="button" className="button ghost" onClick={handleBack}>
          ← Back
        </button>
        <h2>Fork post</h2>
        {!user && (
          <div className="info-panel">
            <span>
              <a href={'/login'}>Log in</a> to publish a post, or use a share link.
            </span>
          </div>
        )}
        {originalAuthor && (
          <p>
            Fork from <a href={`/post/${id}`}>{formatPostTitle(originalTitle)}</a> by{' '}
            <a href={`/u/${originalAuthor}`}>@{originalAuthor}</a>
          </p>
        )}
        {!originalAuthor && <p>Fork from unknown post</p>}
        <form className="create-form" onSubmit={handleSubmit}>
          <div className="flex-row justify-content-end mb-8">
            <TooltipHint
              className="ml-auto"
              storageKey="enter-focus-mode-fork"
              content="Distraction-free editor. Your work is preserved."
              placement="bottom"
            >
              <button
                type="button"
                className="button secondary ghost small ml-auto"
                onClick={() => void router.push(`/fork/${id}/focus`)}
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
            showActions={!!user}
            isFork={true}
            liveUpdateEnabled={liveUpdateEnabled}
            onLiveUpdateChange={setLiveUpdateEnabled}
            onSaveAsDraft={handleSaveAsDraft}
            onPublish={handlePublish}
            lockLicense={isShareAlike}
            showDiscardChangesButton={true}
            onDiscardChangesClick={() => setShowDiscardConfirm(true)}
            hasUnsavedChanges={hasUnsavedChanges}
          />
        </form>

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
