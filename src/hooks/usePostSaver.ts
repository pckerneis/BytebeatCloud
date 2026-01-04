import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { validateExpression } from '../utils/expression-validator';
import { convertMentionsToIds } from '../utils/mentions';
import { ModeOption } from '../model/expression';
import { LicenseOption } from '../model/postEditor';
import { ValidationIssue } from '../utils/expression-validator';

export interface PostSaveData {
  title: string;
  description: string;
  expression: string;
  mode: ModeOption;
  sampleRate: number;
  license: LicenseOption;
  isDraft: boolean;
}

export interface UsePostSaverOptions {
  mode: 'create' | 'edit' | 'fork';
  postId?: string;
  userId?: string;
  onValidationError?: (issue: ValidationIssue) => void;
}

export interface UsePostSaverResult {
  savePost: (data: PostSaveData) => Promise<string | null>;
  saveStatus: 'idle' | 'saving' | 'success';
  saveError: string;
  setSaveError: (error: string) => void;
}

export function usePostSaver(options: UsePostSaverOptions): UsePostSaverResult {
  const { mode, postId, userId, onValidationError } = options;
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');

  const savePost = async (data: PostSaveData): Promise<string | null> => {
    const trimmedTitle = data.title.trim();
    const trimmedExpr = data.expression.trim();
    const trimmedDescription = data.description.trim();

    const result = validateExpression(trimmedExpr);
    if (!result.valid) {
      if (onValidationError && result.issues[0]) {
        onValidationError(result.issues[0]);
      }
      return null;
    }

    if (!userId) {
      setSaveError(`You must be logged in to ${mode} a post.`);
      return null;
    }

    setSaveStatus('saving');
    setSaveError('');

    try {
      const storedDescription = await convertMentionsToIds(trimmedDescription || '');

      if (mode === 'create') {
        const { data: insertData, error } = await supabase
          .from('posts')
          .insert({
            profile_id: userId,
            title: trimmedTitle,
            description: storedDescription,
            expression: trimmedExpr,
            is_draft: data.isDraft,
            sample_rate: data.sampleRate,
            mode: data.mode,
            license: data.license,
          })
          .select('id')
          .single();

        if (error || !insertData) {
          setSaveError(error ? error.message : 'Unknown error while creating post.');
          setSaveStatus('idle');
          return null;
        }

        setSaveStatus('success');
        return insertData.id;
      } else if (mode === 'edit') {
        if (!postId) {
          setSaveError('Post ID is required for editing.');
          setSaveStatus('idle');
          return null;
        }

        const { error } = await supabase
          .from('posts')
          .update({
            title: trimmedTitle,
            description: storedDescription,
            expression: trimmedExpr,
            is_draft: data.isDraft,
            sample_rate: data.sampleRate,
            mode: data.mode,
            license: data.license,
          })
          .eq('id', postId)
          .eq('profile_id', userId);

        if (error) {
          setSaveError(error.message);
          setSaveStatus('idle');
          return null;
        }

        setSaveStatus('success');
        return postId;
      } else if (mode === 'fork') {
        if (!postId) {
          setSaveError('Post ID is required for forking.');
          setSaveStatus('idle');
          return null;
        }

        const { data: insertData, error } = await supabase
          .from('posts')
          .insert({
            profile_id: userId,
            title: trimmedTitle,
            description: storedDescription,
            expression: trimmedExpr,
            is_draft: data.isDraft,
            sample_rate: data.sampleRate,
            mode: data.mode,
            license: data.license,
            fork_of_post_id: postId,
            is_fork: true,
          })
          .select('id')
          .single();

        if (error || !insertData) {
          setSaveError(error ? error.message : 'Unknown error while saving fork.');
          setSaveStatus('idle');
          return null;
        }

        setSaveStatus('success');
        return insertData.id;
      }

      return null;
    } catch (error) {
      setSaveError(`Failed to ${mode} post`);
      setSaveStatus('idle');
      return null;
    }
  };

  return { savePost, saveStatus, saveError, setSaveError };
}
