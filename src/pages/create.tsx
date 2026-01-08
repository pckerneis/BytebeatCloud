import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { PostEditorFormFields } from '../components/PostEditorFormFields';
import Head from 'next/head';
import { ModeOption, MAX_SAMPLE_RATE, MIN_SAMPLE_RATE } from '../model/expression';
import Link from 'next/link';
import { useCurrentWeeklyChallenge } from '../hooks/useCurrentWeeklyChallenge';
import { TooltipHint } from '../components/TooltipHint';
import { usePostEditor } from '../hooks/usePostEditor';

export default function CreatePage() {
  const router = useRouter();
  const [hasWeeklySubmission, setHasWeeklySubmission] = useState(false);
  const { weekNumber: currentWeekNumber, theme: currentTheme } = useCurrentWeeklyChallenge();

  const editor = usePostEditor({
    mode: 'create',
    initialMode: ModeOption.Uint8,
    loopPreview: true,
  });

  // Check if user already has a submission for current week
  useEffect(() => {
    const checkWeeklySubmission = async () => {
      if (!editor.user || currentWeekNumber === null) {
        setHasWeeklySubmission(false);
        return;
      }

      const weekTag = `#week${currentWeekNumber}`;
      const { data, error } = await supabase
        .from('posts')
        .select('id')
        .eq('profile_id', (editor.user as any).id)
        .eq('is_draft', false)
        .or(`title.ilike.%${weekTag}%,description.ilike.%${weekTag}%`)
        .limit(1);

      if (!error && data && data.length > 0) {
        setHasWeeklySubmission(true);
      } else {
        setHasWeeklySubmission(false);
      }
    };

    void checkWeeklySubmission();
  }, [editor.user, currentWeekNumber]);

  // On first load, prefill from URL query parameter
  useEffect(() => {
    if (!router.isReady || !editor.isStateLoaded) return;
    if (typeof window === 'undefined') return;

    const { q } = router.query;
    const qStr = typeof q === 'string' ? q : undefined;

    if (qStr) {
      try {
        const decoded = atob(qStr);
        const parsed = JSON.parse(decoded) as {
          title?: string;
          expr?: string;
          mode?: ModeOption;
          sr?: number;
        } | null;

        if (parsed && typeof parsed.expr === 'string') {
          editor.setState({
            title: parsed.title,
            expression: parsed.expr,
            mode: parsed.mode,
            sampleRate: parsed.sr
              ? Math.min(Math.max(MIN_SAMPLE_RATE, parsed.sr), MAX_SAMPLE_RATE)
              : undefined,
          });
        }
      } catch {
        // ignore malformed q param
      }
    }
    // Only run once when state is loaded and router is ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, editor.isStateLoaded]);

  // If URL has weekly param, prefill description
  useEffect(() => {
    if (!router.isReady || !editor.isStateLoaded) return;
    if (!editor.user) return;

    const hasWeeklyParam = Object.prototype.hasOwnProperty.call(router.query, 'weekly');

    if (!hasWeeklyParam) return;
    if (currentWeekNumber === null) return;

    const weekTag = `#week${currentWeekNumber}`;
    const hasExactWeekTag = new RegExp(`(^|\\s)${weekTag}(?!\\w)`).test(editor.description);

    if (!hasExactWeekTag) {
      editor.setDescription(
        `Submission for ${weekTag} challenge` +
          (editor.description.trim() ? `\n${editor.description}` : ''),
      );
    }
    // editor.setDescription is stable, editor.description is intentionally checked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query, editor.isStateLoaded, editor.user, currentWeekNumber]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await editor.handleSaveAndNavigate(false, (postId) => {
      void router.push(`/post/${postId}`);
    });
  };

  const handleSaveAsDraft = () => {
    void editor.handleSaveAndNavigate(true, (postId) => {
      void router.push(`/edit/${postId}`);
    });
  };

  const weeklyTagRegex =
    currentWeekNumber !== null ? new RegExp(`(^|\\s)#week${currentWeekNumber}(?!\\w)`) : null;

  const isWeeklyParticipation =
    currentWeekNumber !== null &&
    !editor.isDraft &&
    weeklyTagRegex !== null &&
    (weeklyTagRegex.test(editor.description) || weeklyTagRegex.test(editor.title));

  const addWeekTag = () => {
    editor.setDescription(
      editor.description.trim()
        ? editor.description + `\n#week${currentWeekNumber}`
        : `#week${currentWeekNumber}`,
    );
  };

  return (
    <>
      <Head>
        <title>Create - BytebeatCloud</title>
        <meta name="description" content="Create a new bytebeat on BytebeatCloud" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Create - BytebeatCloud" />
        <meta property="og:description" content="Create a new bytebeat on BytebeatCloud" />
        <meta
          property="og:image"
          content={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/og/create${editor.expression ? `?expr=${encodeURIComponent(editor.expression)}` : ''}`}
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <section>
        <div className="flex-row align-items-center">
          <h2>Create</h2>
          <div className="ml-auto">
            <TooltipHint
              storageKey="enter-focus-mode-fork"
              content="Distraction-free editor. Your work is preserved."
              placement="bottom"
            >
              <button
                type="button"
                className="button secondary ghost small"
                onClick={() => void router.push(`/create/focus`)}
                title="Enter focus mode (Ctrl+Shift+F)"
              >
                ⛶ Enter Focus Mode
              </button>
            </TooltipHint>
          </div>
        </div>
        {!editor.user && (
          <div className="info-panel">
            <span>
              <a href={'/login'}>Log in</a> to publish a post, or use a share link.
            </span>
          </div>
        )}

        {editor.user && isWeeklyParticipation && (
          <div className="info-panel">
            <div>
              You are about to submit a participation for the{' '}
              <Link href="/about-weekly" target="_blank">
                #week{currentWeekNumber} challenge
              </Link>
              .
            </div>
            <div>This week&#39;s theme is &#34;{currentTheme}&#34;.</div>
          </div>
        )}

        {editor.user && !isWeeklyParticipation && currentTheme && !hasWeeklySubmission && (
          <div className="info-panel">
            <span>This week&#39;s theme is &#34;{currentTheme}&#34;.</span>
            <div>
              <span className={'link'} onClick={addWeekTag}>
                Add the tag &quot;#week{currentWeekNumber}&quot;
              </span>{' '}
              to the post description to participate the{' '}
              <Link href="/about-weekly" target="_blank">
                weekly challenge
              </Link>
              .
            </div>
          </div>
        )}

        <form className="create-form" onSubmit={handleSubmit}>
          <PostEditorFormFields
            meta={editor.meta}
            onMetaChange={editor.handleMetaChange}
            expression={editor.expression}
            onExpressionChange={editor.handleExpressionChange}
            isPlaying={editor.isPlaying}
            onPlayClick={editor.onPlayClick}
            validationIssue={editor.validationIssue}
            lastError={editor.lastError || null}
            saveStatus={editor.saveStatus}
            saveError={editor.saveError}
            showActions={!!editor.user}
            isEdit={false}
            liveUpdateEnabled={editor.liveUpdateEnabled}
            onLiveUpdateChange={editor.setLiveUpdateEnabled}
          />

          {editor.user && (
            <div className="form-actions">
              <div className="form-actions-buttons">
                <button
                  type="button"
                  className="button secondary"
                  onClick={handleSaveAsDraft}
                  disabled={
                    !editor.expression.trim() ||
                    !!editor.validationIssue ||
                    editor.saveStatus === 'saving'
                  }
                >
                  {editor.saveStatus === 'saving' && editor.isDraft ? 'Saving…' : 'Save as draft'}
                </button>

                <button
                  type="submit"
                  className="button primary"
                  disabled={
                    !editor.expression.trim() ||
                    !!editor.validationIssue ||
                    editor.saveStatus === 'saving'
                  }
                >
                  {editor.saveStatus === 'saving' && !editor.isDraft ? 'Publishing…' : 'Publish'}
                </button>
              </div>
            </div>
          )}

          {editor.saveError && <p className="error-message">{editor.saveError}</p>}
          {editor.saveStatus === 'success' && !editor.saveError && (
            <p className="counter">Post saved.</p>
          )}
        </form>
      </section>
    </>
  );
}
