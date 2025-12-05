import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../../hooks/usePlayerStore';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { supabase } from '../../lib/supabaseClient';
import { PostEditorFormFields } from '../../components/PostEditorFormFields';
import Head from 'next/head';
import { ModeOption, decodeMode, encodeMode, DEFAULT_SAMPLE_RATE } from '../../model/expression';
import { validateExpression } from '../../utils/expression-validator';
import { useExpressionPlayer } from '../../hooks/useExpressionPlayer';

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
  const { setCurrentPostById } = usePlayerStore();

  const { user } = useSupabaseAuth();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');
  const [originalTitle, setOriginalTitle] = useState<string>('');
  const [originalAuthor, setOriginalAuthor] = useState<string | null>(null);
  const [liveUpdateEnabled, setLiveUpdateEnabled] = useState(false);

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
      void stop();
    };
  }, [stop]);

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
        // eslint-disable-next-line no-console
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

      setTitle(baseTitle ?? '');
      setDescription(data.description ?? '');
      setExpression(data.expression ?? '');
      setIsDraft(Boolean(data.is_draft));
      setMode(decodeMode(data.mode as any));
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

    const modeValue = encodeMode(mode);

    const { data, error } = await supabase
      .from('posts')
      .insert({
        profile_id: (user as any).id,
        title: trimmedTitle,
        description: trimmedDescription || '',
        expression: trimmedExpr,
        is_draft: isDraft,
        sample_rate: sampleRate,
        mode: modeValue,
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

  if (loading) {
    return (
      <section>
        <h2>Fork post</h2>
        <p>Loading…</p>
      </section>
    );
  }

  return (
    <>
      <Head>
        <title>BytebeatCloud - Fork post</title>
      </Head>
      <section>
        <button type="button" className="button ghost" onClick={() => router.back()}>
          ← Back
        </button>
        <h2>Fork post</h2>
        {!user && (
          <p className="text-centered login-to-publish-message">
            <a href={'/login'}>Log in</a> to publish a post, or use a share link.
          </p>
        )}
        {originalAuthor && (
          <p>
            Fork from <a href={`/post/${id}`}>{originalTitle || '(untitled)'}</a> by{' '}
            <a href={`/u/${originalAuthor}`}>@{originalAuthor}</a>
          </p>
        )}
        {(!originalAuthor) && <p>Fork from unknown post</p>}
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
            submitLabel={saveStatus === 'saving' ? 'Saving…' : 'Save fork'}
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
