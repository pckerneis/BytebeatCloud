import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { PostEditorFormFields } from '../../components/PostEditorFormFields';
import Head from 'next/head';
import { formatPostTitle } from '../../utils/post-format';
import { TooltipHint } from '../../components/TooltipHint';
import OverflowMenu from '../../components/OverflowMenu';
import { usePostEditor } from '../../hooks/usePostEditor';
import { copyShareLinkToClipboard } from '../../utils/shareLink';
import { useHasHistory } from '../../hooks/useHasHistory';

export default function ForkPostPage() {
  const router = useRouter();
  const { id } = router.query;
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const hasHistory = useHasHistory();

  const editor = usePostEditor({
    mode: 'fork',
    postId: id,
    loopPreview: false,
  });

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

  const handlePublish = () => {
    void editor.handleSaveAndNavigate(false, (postId) => {
      void router.push(`/post/${postId}`);
    });
  };

  const handleDiscardChanges = async () => {
    editor.clearDraft();
    setShowDiscardConfirm(false);
    window.location.reload();
  };

  // Override handleMetaChange to enforce share-alike license
  const handleMetaChange = (next: typeof editor.meta) => {
    if (editor.isShareAlike) {
      // Keep share-alike license when forking a share-alike post
      editor.handleMetaChange({
        ...next,
        license: editor.license,
      });
    } else {
      editor.handleMetaChange(next);
    }
  };

  const hasUnsavedChanges =
    editor.originalData &&
    (editor.title !== editor.originalData.title ||
      editor.expression !== editor.originalData.expression ||
      editor.mode !== editor.originalData.mode ||
      editor.sampleRate !== editor.originalData.sampleRate ||
      editor.description !== editor.originalData.description);

  const handleBack = () => {
    router.back();
  };

  if (editor.loading) {
    return (
      <section>
        {hasHistory && (
          <button type="button" className="button ghost" onClick={handleBack}>
            ← Back
          </button>
        )}
        <h2>Fork post</h2>
        <p>Loading…</p>
      </section>
    );
  }

  if (editor.loadError) {
    return (
      <section>
        {hasHistory && (
          <button type="button" className="button ghost" onClick={handleBack}>
            ← Back
          </button>
        )}
        <h2>Fork post</h2>
        <p className="error-message">{editor.loadError}</p>
      </section>
    );
  }

  const handleCopyShareLink = async () => {
    const success = await copyShareLinkToClipboard({
      title: editor.title,
      expression: editor.expression,
      mode: editor.mode,
      sampleRate: editor.sampleRate,
    });

    if (success) {
      setShareLinkCopied(true);
    }
  };

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
        {hasHistory && (
          <button type="button" className="button ghost" onClick={handleBack}>
            ← Back
          </button>
        )}
        <div className="flex-row align-items-center">
          <h2>Fork post</h2>
          <div className="ml-auto">
            <TooltipHint
              storageKey="enter-focus-mode-fork"
              content="Distraction-free editor. Your work is preserved."
              placement="bottom"
            >
              <button
                type="button"
                className="button secondary ghost small"
                onClick={() => void router.push(`/fork/${id}/focus`)}
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
        {editor.originalData?.originalAuthor && (
          <p>
            Fork from <a href={`/post/${id}`}>{formatPostTitle(editor.originalData.title)}</a> by{' '}
            <a href={`/u/${editor.originalData.originalAuthor}`}>
              @{editor.originalData.originalAuthor}
            </a>
          </p>
        )}
        {!editor.originalData?.originalAuthor && <p>Fork from unknown post</p>}
        <form className="create-form" onSubmit={handleSubmit}>
          <PostEditorFormFields
            meta={editor.meta}
            onMetaChange={handleMetaChange}
            expression={editor.expression}
            onExpressionChange={editor.handleExpressionChange}
            isPlaying={editor.isPlaying}
            onPlayClick={editor.onPlayClick}
            validationIssue={editor.validationIssue}
            lastError={editor.lastError || null}
            saveStatus={editor.saveStatus}
            saveError={editor.saveError}
            showActions={!!editor.user}
            liveUpdateEnabled={editor.liveUpdateEnabled}
            onLiveUpdateChange={editor.setLiveUpdateEnabled}
            isShareAlikeFork={editor.isShareAlike}
            isEdit={false}
          />

          <div className="form-actions">
            <div className="form-actions-buttons">
              <OverflowMenu disabled={editor.saveStatus === 'saving'}>
                <button
                  type="button"
                  className="overflow-menu-item danger"
                  onClick={() => setShowDiscardConfirm(true)}
                  disabled={editor.saveStatus === 'saving' || !hasUnsavedChanges}
                >
                  Discard changes…
                </button>
                {editor.user && (
                  <button
                    type="button"
                    className="overflow-menu-item"
                    onClick={handleSaveAsDraft}
                    disabled={
                      !editor.expression.trim() ||
                      !!editor.validationIssue ||
                      editor.saveStatus === 'saving'
                    }
                  >
                    {editor.saveStatus === 'saving' && editor.isDraft ? 'Saving…' : 'Save as draft'}
                  </button>
                )}
              </OverflowMenu>

              {editor.user ? (
                <button
                  type="button"
                  className="button primary"
                  onClick={handlePublish}
                  disabled={
                    !editor.expression.trim() ||
                    !!editor.validationIssue ||
                    editor.saveStatus === 'saving'
                  }
                >
                  {editor.saveStatus === 'saving' && !editor.isDraft ? 'Publishing…' : 'Publish'}
                </button>
              ) : (
                <button
                  type="button"
                  className="button secondary"
                  disabled={!editor.expression.trim()}
                  onClick={handleCopyShareLink}
                >
                  {shareLinkCopied ? 'Link copied' : 'Copy share link'}
                </button>
              )}
            </div>
          </div>

          {editor.saveError && <p className="error-message">{editor.saveError}</p>}
          {editor.saveStatus === 'success' && !editor.saveError && (
            <p className="counter">Fork saved.</p>
          )}
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
