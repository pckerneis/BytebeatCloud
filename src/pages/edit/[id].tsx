import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { PostEditorFormFields } from '../../components/PostEditorFormFields';
import Head from 'next/head';
import { TooltipHint } from '../../components/TooltipHint';
import OverflowMenu from '../../components/OverflowMenu';
import { usePostEditor } from '../../hooks/usePostEditor';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import Link from 'next/link';

export default function EditPostPage() {
  const router = useRouter();
  const { id } = router.query;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const editor = usePostEditor({
    mode: 'edit',
    postId: id,
    loopPreview: false,
  });

  const savePost = async (asDraft: boolean) => {
    const postId = await editor.savePost({
      title: editor.title,
      description: editor.description,
      expression: editor.expression,
      mode: editor.mode,
      sampleRate: editor.sampleRate,
      license: editor.license,
      isDraft: asDraft,
    });

    if (postId && !asDraft) {
      editor.clearDraft();
      await router.push(`/post/${postId}`);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await savePost(false);
  };

  const handleSaveAsDraft = async () => {
    await savePost(true);
    // Update isDraft state to show draft info panel
    editor.setState({ isDraft: true });
  };

  const handleDiscardChanges = async () => {
    editor.clearDraft();
    setShowDiscardConfirm(false);
    window.location.reload();
  };

  const handleDelete = async () => {
    if (!id || typeof id !== 'string') return;
    if (!editor.user) {
      editor.setSaveError('You must be logged in to delete a post.');
      return;
    }

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', id)
      .eq('profile_id', (editor.user as any).id);

    if (error) {
      editor.setSaveError(error.message);
      return;
    }

    await router.push('/profile');
  };

  const meta = {
    title: editor.title,
    description: editor.description,
    mode: editor.mode,
    sampleRate: editor.sampleRate,
    isDraft: editor.isDraft,
    license: editor.license,
  };

  const handleMetaChange = (next: typeof meta) => {
    editor.setState(next);
  };

  const handleBack = () => {
    if (id && typeof id === 'string') {
      void router.push(`/post/${id}`);
    } else {
      void router.push('/');
    }
  };

  if (editor.loading) {
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

  if (!editor.user) {
    return (
      <section>
        <button type="button" className="button ghost" onClick={handleBack}>
          ← Back
        </button>
        <h2>Edit post</h2>
        <p>You need to <Link href="/login">log in</Link> in order to edit a post.</p>
      </section>
    );
  }

  if (editor.loadError) {
    return (
      <section>
        <button type="button" className="button ghost" onClick={handleBack}>
          ← Back
        </button>
        <h2>Edit post</h2>
        <p className="error-message">{editor.loadError}</p>
      </section>
    );
  }

  const hasUnsavedChanges =
    editor.originalData &&
    (editor.title !== editor.originalData.title ||
      editor.expression !== editor.originalData.expression ||
      editor.mode !== editor.originalData.mode ||
      editor.sampleRate !== editor.originalData.sampleRate ||
      editor.description !== editor.originalData.description);

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
        <div className="flex-row align-items-center">
          <h2>Edit post</h2>
          <div className="ml-auto">
            <TooltipHint
              storageKey="enter-focus-mode-fork"
              content="Distraction-free editor. Your work is preserved."
              placement="bottom"
            >
              <button
                type="button"
                className="button secondary ghost small"
                onClick={() => void router.push(`/edit/${id}/focus`)}
                title="Enter focus mode (Ctrl+Shift+F)"
              >
                ⛶ Enter Focus Mode
              </button>
            </TooltipHint>
          </div>
        </div>
        {editor.isDraft && (
          <div className="info-panel">
            <span>
              You&apos;re editing a draft. The post won&apos;t be visible to anyone until you
              publish it.
            </span>
          </div>
        )}
        <form className="create-form" onSubmit={handleSubmit}>
          <PostEditorFormFields
            meta={meta}
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
            isFork={false}
            liveUpdateEnabled={editor.liveUpdateEnabled}
            onLiveUpdateChange={editor.setLiveUpdateEnabled}
          />

          {editor.user && (
            <div className="form-actions">
              <div className="form-actions-buttons">
                <OverflowMenu disabled={editor.saveStatus === 'saving'}>
                  <button
                    type="button"
                    className="overflow-menu-item"
                    onClick={
                      !editor.isDraft ? () => setShowUnpublishConfirm(true) : handleSaveAsDraft
                    }
                    disabled={
                      !editor.expression.trim() ||
                      !!editor.validationIssue ||
                      editor.saveStatus === 'saving'
                    }
                  >
                    {editor.saveStatus === 'saving' && editor.isDraft
                      ? 'Saving…'
                      : !editor.isDraft
                        ? 'Unpublish…'
                        : 'Save as draft'}
                  </button>
                  <button
                    type="button"
                    className="overflow-menu-item danger"
                    onClick={() => setShowDiscardConfirm(true)}
                    disabled={editor.saveStatus === 'saving' || !hasUnsavedChanges}
                  >
                    Discard changes…
                  </button>
                  <button
                    type="button"
                    className="overflow-menu-item danger"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={editor.saveStatus === 'saving'}
                  >
                    Delete…
                  </button>
                </OverflowMenu>

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
                  disabled={editor.saveStatus === 'saving'}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button danger"
                  onClick={() => void handleDelete()}
                  disabled={editor.saveStatus === 'saving'}
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
                  disabled={editor.saveStatus === 'saving'}
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
                  disabled={editor.saveStatus === 'saving'}
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
