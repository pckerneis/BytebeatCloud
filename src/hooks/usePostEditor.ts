import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { usePostEditorState, UsePostEditorStateOptions } from './usePostEditorState';
import { usePostDraftPersistence } from './usePostDraftPersistence';
import { usePostLoader } from './usePostLoader';
import { usePostSaver } from './usePostSaver';
import { useBytebeatPlayer } from './useBytebeatPlayer';
import { usePlayerStore } from './usePlayerStore';
import { useExpressionPlayer } from './useExpressionPlayer';
import { useCtrlSpacePlayShortcut } from './useCtrlSpacePlayShortcut';
import { useFocusModeShortcut } from './useFocusModeShortcut';
import { useCurrentUserProfile } from './useCurrentUserProfile';

export interface UsePostEditorOptions extends UsePostEditorStateOptions {
  mode: 'create' | 'edit' | 'fork';
  postId?: string | string[];
  enableVisualizer?: boolean;
  loopPreview?: boolean;
  enableDraftPersistence?: boolean;
}

export function usePostEditor(options: UsePostEditorOptions) {
  const {
    mode,
    postId,
    enableVisualizer = false,
    loopPreview = true,
    enableDraftPersistence = true,
  } = options;
  const router = useRouter();
  const { username, user } = useCurrentUserProfile();
  const userId = (user as any)?.id;

  const editorState = usePostEditorState(options);
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [isPublishPanelOpen, setIsPublishPanelOpen] = useState(false);

  const storageKey =
    mode === 'create'
      ? 'bytebeat-cloud-create-draft-v1'
      : mode === 'edit'
        ? `edit-draft-${postId}`
        : `fork-draft-${postId}`;

  const { loadDraft, clearDraft } = usePostDraftPersistence(editorState, {
    storageKey,
    enabled: enableDraftPersistence && isStateLoaded,
  });

  const postLoader = usePostLoader({
    postId,
    userId,
    mode: mode === 'create' ? 'edit' : mode,
    enabled: mode !== 'create' && !!postId,
  });

  const { isPlaying, toggle, stop, updateExpression, lastError } = useBytebeatPlayer({
    enableVisualizer,
  });

  const { currentPost, setCurrentPostById } = usePlayerStore();

  const {
    validationIssue,
    handleExpressionChange,
    handlePlayClick: handlePlayClickBase,
    setValidationIssue,
  } = useExpressionPlayer({
    expression: editorState.expression,
    setExpression: editorState.setExpression,
    mode: editorState.mode,
    sampleRateValue: editorState.sampleRate,
    toggle,
    setCurrentPostById,
    loopPreview,
    isPlaying,
    liveUpdateEnabled: editorState.liveUpdateEnabled,
    updateExpression,
    currentPost,
  });

  const postSaver = usePostSaver({
    mode,
    postId: typeof postId === 'string' ? postId : undefined,
    userId,
    onValidationError: setValidationIssue,
  });

  const handlePlayClick = () => handlePlayClickBase(currentPost);

  useCtrlSpacePlayShortcut(handlePlayClick);
  useFocusModeShortcut();

  useEffect(() => {
    return () => {
      if (!currentPost) {
        void stop();
      }
    };
  }, [stop, currentPost]);

  useEffect(() => {
    if (mode !== 'create') return;
    if (typeof window === 'undefined') return;

    const draft = loadDraft();
    if (draft) {
      editorState.setState({
        title: draft.title ?? '',
        description: draft.description ?? '',
        expression: draft.expression ?? '',
        mode: draft.mode as any,
        sampleRate: draft.sampleRate,
        license: draft.license as any,
        liveUpdateEnabled: draft.liveUpdateEnabled,
      });
    }
    setIsStateLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode === 'create' || !postLoader.data) return;

    const draft = loadDraft();

    // Combine server data with draft overrides in a single state update
    editorState.setState({
      title: draft?.title ?? postLoader.data.title,
      description: draft?.description ?? postLoader.data.description,
      expression: draft?.expression ?? postLoader.data.expression,
      mode: (draft?.mode as any) ?? postLoader.data.mode,
      sampleRate: draft?.sampleRate ?? postLoader.data.sampleRate,
      license: (draft?.license as any) ?? postLoader.data.license,
      isDraft: postLoader.data.isDraft,
    });

    setIsStateLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postLoader.data, mode]);

  const handlePublish = async () => {
    const savedPostId = await postSaver.savePost({
      title: editorState.title,
      description: editorState.description,
      expression: editorState.expression,
      mode: editorState.mode,
      sampleRate: editorState.sampleRate,
      license: editorState.license,
      isDraft: false,
    });

    if (savedPostId) {
      clearDraft();
      setIsPublishPanelOpen(false);
      await router.push(`/post/${savedPostId}`);
    }
  };

  const handleSaveAsDraft = async () => {
    const savedPostId = await postSaver.savePost({
      title: editorState.title,
      description: editorState.description,
      expression: editorState.expression,
      mode: editorState.mode,
      sampleRate: editorState.sampleRate,
      license: editorState.license,
      isDraft: true,
    });

    if (savedPostId) {
      clearDraft();
      setIsPublishPanelOpen(false);
    }
  };

  const canPublish = editorState.expression.trim().length > 0 && postSaver.saveStatus !== 'saving';

  // Common handlers for create/fork pages
  const handleSaveAndNavigate = async (asDraft: boolean, onSuccess?: (postId: string) => void) => {
    const postId = await postSaver.savePost({
      title: editorState.title,
      description: editorState.description,
      expression: editorState.expression,
      mode: editorState.mode,
      sampleRate: editorState.sampleRate,
      license: editorState.license,
      isDraft: asDraft,
    });

    if (postId) {
      clearDraft();
      if (onSuccess) {
        onSuccess(postId);
      }
    }

    return postId;
  };

  const meta = {
    title: editorState.title,
    description: editorState.description,
    mode: editorState.mode,
    sampleRate: editorState.sampleRate,
    isDraft: editorState.isDraft,
    license: editorState.license,
  };

  const handleMetaChange = (next: typeof meta) => {
    editorState.setState(next);
  };

  return {
    ...editorState,
    user,
    username,
    isPlaying,
    onPlayClick: handlePlayClick,
    validationIssue,
    lastError,
    handleExpressionChange,
    setValidationIssue,
    saveStatus: postSaver.saveStatus,
    saveError: postSaver.saveError,
    setSaveError: postSaver.setSaveError,
    savePost: postSaver.savePost,
    handlePublish,
    handleSaveAsDraft,
    handleSaveAndNavigate,
    canPublish,
    isPublishPanelOpen,
    setIsPublishPanelOpen,
    clearDraft,
    loading: postLoader.loading,
    loadError: postLoader.error,
    isShareAlike: postLoader.isShareAlike,
    originalData: postLoader.data,
    isStateLoaded,
    meta,
    handleMetaChange,
  };
}
