import { useEffect } from 'react';
import { PostEditorState } from './usePostEditorState';

const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface DraftData {
  title?: string;
  description?: string;
  expression?: string;
  mode?: string;
  sampleRate?: number;
  license?: string;
  liveUpdateEnabled?: boolean;
  timestamp?: number;
}

export interface UsePostDraftPersistenceOptions {
  storageKey: string;
  enabled?: boolean;
  onLoad?: (draft: DraftData) => void;
}

export function usePostDraftPersistence(
  state: Partial<PostEditorState>,
  options: UsePostDraftPersistenceOptions,
) {
  const { storageKey, enabled = true, onLoad } = options;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const draft: DraftData = {
      title: state.title,
      description: state.description,
      expression: state.expression,
      mode: state.mode,
      sampleRate: state.sampleRate,
      license: state.license,
      liveUpdateEnabled: state.liveUpdateEnabled,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch (error) {
      console.error('Failed to save draft to localStorage:', error);
    }
  }, [
    storageKey,
    enabled,
    state.title,
    state.description,
    state.expression,
    state.mode,
    state.sampleRate,
    state.license,
    state.liveUpdateEnabled,
  ]);

  const loadDraft = (): DraftData | null => {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;

      const draft: DraftData = JSON.parse(stored);
      const age = Date.now() - (draft.timestamp || 0);

      if (age < DRAFT_MAX_AGE_MS) {
        return draft;
      } else {
        localStorage.removeItem(storageKey);
        return null;
      }
    } catch (error) {
      console.error('Failed to load draft from localStorage:', error);
      return null;
    }
  };

  const clearDraft = () => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('Failed to clear draft from localStorage:', error);
    }
  };

  return { loadDraft, clearDraft };
}
