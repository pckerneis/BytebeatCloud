import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../../../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../../../hooks/usePlayerStore';
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

const page: NextPageWithLayout = function ForkPostFocusPage() {
  const router = useRouter();
  const { id } = router.query;
  const { username, user } = useCurrentUserProfile();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expression, setExpression] = useState('');
  const [mode, setMode] = useState<ModeOption>(ModeOption.Float);
  const [sampleRate, setSampleRate] = useState<number>(DEFAULT_SAMPLE_RATE);
  const [license, setLicense] = useState<LicenseOption>(DEFAULT_LICENSE);
  const [isPublishPanelOpen, setIsPublishPanelOpen] = useState(false);

  const { isPlaying, toggle, stop, updateExpression } = useBytebeatPlayer({
    enableVisualizer: false,
  });
  const { currentPost, setCurrentPostById } = usePlayerStore();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');
  const [isShareAlike, setIsShareAlike] = useState(false);
  const [liveUpdateEnabled, setLiveUpdateEnabled] = useState(true);

  const { handlePlayClick: handlePlayClickBase } = useExpressionPlayer({
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

    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch (error) {
      console.error('Failed to save draft to localStorage:', error);
    }
  }, [id, title, description, expression, mode, sampleRate, license, loading]);

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
    if (!id || typeof id !== 'string') return;

    const loadPost = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('posts')
        .select(
          `
          *,
          profile:profiles(username)
        `,
        )
        .eq('id', id)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      setTitle(data.title || '');
      setExpression(data.expression || '');
      setMode((data.mode as ModeOption) || ModeOption.Float);
      setSampleRate(data.sample_rate || DEFAULT_SAMPLE_RATE);

      const originalLicense = (data.license as LicenseOption) || DEFAULT_LICENSE;
      setIsShareAlike(originalLicense === 'cc-by-sa');
      setLicense(isShareAlike ? 'cc-by-sa' : DEFAULT_LICENSE);

      if (data.description) {
        const displayDescription = await convertMentionsToUsernames(data.description);
        setDescription(displayDescription.text);
      } else {
        setDescription('');
      }

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
  }, [id, isShareAlike]);

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
        setSaveError(error ? error.message : 'Unknown error while saving post.');
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
    } catch (error) {
      setSaveError('Failed to save fork');
      setSaveStatus('idle');
    }
  };

  const handlePublishSubmit = async () => {
    await savePost(false);
    if (saveStatus === 'success') {
      setIsPublishPanelOpen(false);
    }
  };

  const handleModeChange = (newMode: ModeOption) => {
    setMode(newMode);
  };

  const handleSampleRateChange = (newRate: number) => {
    setSampleRate(newRate);
  };

  const handleLiveUpdateChange = (enabled: boolean) => {
    setLiveUpdateEnabled(enabled);
  };

  const handlePublish = () => {
    setIsPublishPanelOpen(true);
  };

  const canPublish = expression.trim().length > 0 && saveStatus !== 'saving';

  if (loading) {
    return (
      <>
        <Head>
          <title>Fork post - BytebeatCloud</title>
        </Head>
        <section>
          <h2>Fork post</h2>
          <p className="text-centered secondary-text">Loading…</p>
        </section>
      </>
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
        onExitFocusMode={() => void router.push(`/fork/${id}`)}
      >
        <section style={{ width: '100%', height: '100%', overflow: 'auto' }}>
          <FocusExpressionEditor value={expression} onChange={setExpression} />
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
        onPublish={handlePublishSubmit}
        isPublishing={saveStatus === 'saving'}
        canPublish={canPublish}
        saveError={saveError}
      />
    </>
  );
};

page.getLayout = (page) => page;

export default page;
