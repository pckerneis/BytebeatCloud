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
  const { isPlaying, toggle, lastError, stop, updateExpression } = useBytebeatPlayer({
    enableVisualizer: false,
  });
  const { currentPost, setCurrentPostById } = usePlayerStore();

  const { user } = useSupabaseAuth();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');
  const [originalTitle, setOriginalTitle] = useState<string>('');
  const [originalAuthor, setOriginalAuthor] = useState<string | null>(null);
  const [liveUpdateEnabled, setLiveUpdateEnabled] = useState(true);

  const { validationIssue, handleExpressionChange, handlePlayClick, setValidationIssue } =
    useExpressionPlayer({
      expression,
      setExpression,
      mode,
      sampleRateValue: sampleRate,
      toggle,
      setCurrentPostById,
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
        .select('title,description,expression,is_draft,sample_rate,mode,profiles(username)')
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

      const baseTitle = data.title ?? '';
      setOriginalTitle(baseTitle);
      setOriginalAuthor((data as any).profiles?.username ?? null);

      // Convert @[userId] mentions back to @username for editing
      const { text: displayDescription } = await convertMentionsToUsernames(data.description ?? '');

      setTitle(baseTitle ?? '');
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
  }, [id]);

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
      setSaveError('You must be logged in to save a fork.');
      return;
    }

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
        is_draft: isDraft,
        sample_rate: sampleRate,
        mode,
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

    if (!isDraft) {
      await router.push(`/post/${data.id}`);
    }
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
            <span><a href={'/login'}>Log in</a> to publish a post, or use a share link.</span>
          </div>
        )}
        {originalAuthor && (
          <p>
            Fork from <a href={`/post/${id}`}>{originalTitle || '(untitled)'}</a> by{' '}
            <a href={`/u/${originalAuthor}`}>@{originalAuthor}</a>
          </p>
        )}
        {!originalAuthor && <p>Fork from unknown post</p>}
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
            showActions={!!user}
            isFork={true}
            liveUpdateEnabled={liveUpdateEnabled}
            onLiveUpdateChange={setLiveUpdateEnabled}
          />
        </form>
      </section>
    </>
  );
}
