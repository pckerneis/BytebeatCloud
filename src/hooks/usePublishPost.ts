import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseAuth } from './useSupabaseAuth';
import { validateExpression } from '../utils/expression-validator';
import { convertMentionsToIds } from '../utils/mentions';
import { ModeOption } from '../model/expression';
import { LicenseOption } from '../model/postEditor';

interface PublishPostParams {
  title: string;
  description: string;
  expression: string;
  mode: ModeOption;
  sampleRate: number;
  license: LicenseOption;
  isDraft: boolean;
}

export function usePublishPost() {
  const { user } = useSupabaseAuth();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState('');

  const publishPost = async (params: PublishPostParams) => {
    const { title, description, expression, mode, sampleRate, license, isDraft } = params;

    const trimmedTitle = title.trim();
    const trimmedExpr = expression.trim();
    const trimmedDescription = description.trim();

    // Validate expression
    const result = validateExpression(trimmedExpr);
    if (!result.valid) {
      setSaveError(result.issues[0]?.message || 'Invalid expression');
      return null;
    }

    // Check authentication
    if (!user) {
      setSaveError('You must be logged in to save a post.');
      return null;
    }

    setSaveStatus('saving');
    setSaveError('');

    try {
      // Convert @username mentions to @[userId] format for storage
      const storedDescription = await convertMentionsToIds(trimmedDescription ?? '');

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
          license,
        })
        .select('id')
        .single();

      if (error || !data) {
        setSaveError(error ? error.message : 'Unknown error while saving post.');
        setSaveStatus('idle');
        return null;
      }

      setSaveStatus('success');
      return data.id;
    } catch (error) {
      setSaveError('Failed to save post');
      setSaveStatus('idle');
      return null;
    }
  };

  const resetStatus = () => {
    setSaveStatus('idle');
    setSaveError('');
  };

  return {
    publishPost,
    saveStatus,
    saveError,
    setSaveError,
    resetStatus,
  };
}
