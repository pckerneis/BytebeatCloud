import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../../../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../../../hooks/usePlayerStore';
import { useSupabaseAuth } from '../../../hooks/useSupabaseAuth';
import { supabase } from '../../../lib/supabaseClient';
import Head from 'next/head';
import { ModeOption, DEFAULT_SAMPLE_RATE } from '../../../model/expression';
import { LicenseOption, DEFAULT_LICENSE } from '../../../model/postEditor';
import { validateExpression } from '../../../utils/expression-validator';
import { useExpressionPlayer } from '../../../hooks/useExpressionPlayer';
import { useCtrlSpacePlayShortcut } from '../../../hooks/useCtrlSpacePlayShortcut';
import { convertMentionsToIds, convertMentionsToUsernames } from '../../../utils/mentions';
import { FocusLayout } from '../../../components/FocusLayout';
import { NextPageWithLayout } from '../../_app';
import { FocusExpressionEditor } from '../../../components/FocusExpressionEditor';
import { PublishPanel } from '../../../components/PublishPanel';
import { useCurrentUserProfile } from '../../../hooks/useCurrentUserProfile';
import { useFocusModeShortcut } from '../../../hooks/useFocusModeShortcut';

const page: NextPageWithLayout = function EditPostFocusPage() {
  const router = useRouter();
  const { id } = router.query;
  const { username, user } = useCurrentUserProfile();

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
  const [isPublishPanelOpen, setIsPublishPanelOpen] = useState(false);

  const { isPlaying, toggle, stop, updateExpression } = useBytebeatPlayer({
    enableVisualizer: false,
  });
  const { currentPost, setCurrentPostById } = usePlayerStore();

  const { loading: authLoading } = useSupabaseAuth();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [liveUpdateEnabled, setLiveUpdateEnabled] = useState(true);

  const lastLoadedPostIdRef = useRef<string | null>(null);
  const isDirtyRef = useRef(false);
  const isApplyingServerStateRef = useRef(false);

  const { handleExpressionChange, handlePlayClick: handlePlayClickBase } = useExpressionPlayer({
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

  const onExpressionChange = (value: string) => {
    if (!isApplyingServerStateRef.current) {
      isDirtyRef.current = true;
    }
    handleExpressionChange(value);
  };

  // Save to localStorage whenever state changes
  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    if (isApplyingServerStateRef.current) return;
    if (!isDirtyRef.current) return;

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
  }, [id, title, description, expression, mode, sampleRate, license]);

  useEffect(() => {
    return () => {
      if (!currentPost) {
        void stop();
      }
    };
  }, [stop, currentPost]);

  useCtrlSpacePlayShortcut(handlePlayClick);
  useFocusModeShortcut();

  useEffect(() => {
    if (!router.isReady) return;
    if (authLoading) return;

    if (!user) {
      void router.push('/login');
      return;
    }

    if (!id || typeof id !== 'string') {
      setLoadError('Invalid post ID');
      setLoading(false);
      return;
    }

    if (lastLoadedPostIdRef.current === id) return;

    const loadPost = async () => {
      setLoading(true);
      setLoadError('');

      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', id)
        .eq('profile_id', (user as any).id)
        .single();

      if (error || !data) {
        setLoadError(error?.message || 'Post not found or you do not have permission to edit it.');
        setLoading(false);
        return;
      }

      isApplyingServerStateRef.current = true;

      setTitle(data.title || '');
      setExpression(data.expression || '');
      setMode((data.mode as ModeOption) || ModeOption.Float);
      setSampleRate(data.sample_rate || DEFAULT_SAMPLE_RATE);
      setIsDraft(data.is_draft || false);
      setLicense((data.license as LicenseOption) || DEFAULT_LICENSE);
      setPublishedAt(data.published_at);

      if (data.description) {
        const displayDescription = await convertMentionsToUsernames(data.description);
        setDescription(displayDescription.text);
      } else {
        setDescription('');
      }

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
            isDirtyRef.current = true;
          } else {
            // Clean up old draft
            localStorage.removeItem(draftKey);
          }
        }
      } catch (error) {
        console.error('Failed to load draft from localStorage:', error);
      }

      isApplyingServerStateRef.current = false;
      if (!localStorage.getItem(draftKey)) {
        isDirtyRef.current = false;
      }
      lastLoadedPostIdRef.current = id;
      setLoading(false);
    };

    void loadPost();
  }, [id, user, authLoading, router]);

  const savePost = async (asDraft: boolean) => {
    if (!id || typeof id !== 'string') return;

    const trimmedTitle = title.trim();
    const trimmedExpr = expression.trim();
    const trimmedDescription = description.trim();

    const result = validateExpression(trimmedExpr);
    if (!result.valid) {
      setSaveError(result.issues[0]?.message || 'Invalid expression');
      return;
    }

    if (!user) {
      setSaveError('You must be logged in to save a post.');
      return;
    }

    setSaveStatus('saving');
    setSaveError('');

    try {
      const storedDescription = await convertMentionsToIds(trimmedDescription ?? '');

      const updateData: any = {
        title: trimmedTitle,
        description: storedDescription,
        expression: trimmedExpr,
        is_draft: asDraft,
        sample_rate: sampleRate,
        mode,
      };

      if (!publishedAt) {
        updateData.license = license;
      }

      const { error } = await supabase
        .from('posts')
        .update(updateData)
        .eq('id', id)
        .eq('profile_id', (user as any).id);

      if (error) {
        setSaveError(error.message);
        setSaveStatus('idle');
        return;
      }
    } catch (error) {
      setSaveError('Failed to save post');
      setSaveStatus('idle');
      return;
    }

    setSaveStatus('success');
    isDirtyRef.current = false;

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

  const handlePublishSubmit = async () => {
    await savePost(false);
    if (saveStatus === 'success') {
      setIsPublishPanelOpen(false);
    }
  };

  const handleSaveAsDraft = async () => {
    await savePost(true);
    if (saveStatus === 'success') {
      setIsPublishPanelOpen(false);
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

  const handleModeChange = (newMode: ModeOption) => {
    if (!isApplyingServerStateRef.current) {
      isDirtyRef.current = true;
    }
    setMode(newMode);
  };

  const handleSampleRateChange = (newRate: number) => {
    if (!isApplyingServerStateRef.current) {
      isDirtyRef.current = true;
    }
    setSampleRate(newRate);
  };

  const handleLiveUpdateChange = (enabled: boolean) => {
    setLiveUpdateEnabled(enabled);
  };

  const handlePublish = () => {
    setIsPublishPanelOpen(true);
  };

  const canPublish = expression.trim().length > 0 && saveStatus !== 'saving';

  if (authLoading || loading) {
    return (
      <>
        <Head>
          <title>Edit post - BytebeatCloud</title>
        </Head>
        <section>
          <h2>Edit post</h2>
          <p>Loading…</p>
        </section>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <Head>
          <title>Edit post - BytebeatCloud</title>
        </Head>
        <section>
          <h2>Edit post</h2>
          <p className="error-message">{loadError}</p>
        </section>
      </>
    );
  }

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

      <FocusLayout
        expression={expression}
        mode={mode}
        onModeChange={handleModeChange}
        sampleRate={sampleRate}
        onSampleRateChange={handleSampleRateChange}
        isPlaying={isPlaying}
        onPlayClick={handlePlayClick}
        liveUpdateEnabled={liveUpdateEnabled}
        onLiveUpdateChange={handleLiveUpdateChange}
        onPublish={handlePublish}
        isLoggedIn={!!user}
        username={username}
        title={title}
        onTitleChange={setTitle}
        onExitFocusMode={() => void router.push(`/edit/${id}`)}
      >
        <section style={{ width: '100%', height: '100%', overflow: 'auto' }}>
          <FocusExpressionEditor value={expression} onChange={onExpressionChange} />
        </section>
      </FocusLayout>

      <PublishPanel
        isOpen={isPublishPanelOpen}
        onClose={() => setIsPublishPanelOpen(false)}
        title={title}
        onTitleChange={setTitle}
        description={description}
        onDescriptionChange={setDescription}
        license={license}
        onLicenseChange={setLicense}
        onPublish={isDraft ? handlePublishSubmit : handleSaveAsDraft}
        isPublishing={saveStatus === 'saving'}
        canPublish={canPublish}
        saveError={saveError}
      />

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
                  void handleSaveAsDraft();
                }}
                disabled={saveStatus === 'saving'}
              >
                Unpublish
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

page.getLayout = (page) => page;

export default page;
