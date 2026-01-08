import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ModeOption, DEFAULT_SAMPLE_RATE } from '../model/expression';
import { LicenseOption, DEFAULT_LICENSE } from '../model/postEditor';
import { convertMentionsToUsernames } from '../utils/mentions';

export interface LoadedPostData {
  title: string;
  description: string;
  expression: string;
  mode: ModeOption;
  sampleRate: number;
  license: LicenseOption;
  isDraft: boolean;
  profileId?: string;
  publishedAt?: string | null;
  originalAuthor?: string | null;
}

export interface UsePostLoaderOptions {
  postId: string | string[] | undefined;
  userId?: string;
  mode: 'edit' | 'fork';
  enabled?: boolean;
}

export interface UsePostLoaderResult {
  data: LoadedPostData | null;
  loading: boolean;
  error: string;
  isShareAlike: boolean;
}

export function usePostLoader(options: UsePostLoaderOptions): UsePostLoaderResult {
  const { postId, userId, mode, enabled = true } = options;
  const [data, setData] = useState<LoadedPostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isShareAlike, setIsShareAlike] = useState(false);

  useEffect(() => {
    if (!enabled || !postId || typeof postId !== 'string') {
      return;
    }

    let cancelled = false;

    const loadPost = async () => {
      setLoading(true);
      setError('');

      const selectFields =
        mode === 'edit'
          ? 'title,description,expression,is_draft,sample_rate,mode,profile_id,license,published_at'
          : 'title,description,expression,is_draft,sample_rate,mode,license,profiles(username)';

      const { data: postData, error: fetchError } = await supabase
        .from('posts')
        .select(selectFields)
        .eq('id', postId)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError) {
        console.warn(`Error loading post to ${mode}`, fetchError.message);
        setError(`Unable to load post.`);
        setLoading(false);
        return;
      }

      if (!postData) {
        setError('Post not found.');
        setLoading(false);
        return;
      }

      const post = postData as any;

      if (mode === 'edit') {
        if (post.profile_id && userId && post.profile_id !== userId) {
          setError('You do not have permission to edit this post.');
          setLoading(false);
          return;
        }
      }

      if (mode === 'fork') {
        if (post.license === 'all-rights-reserved') {
          setError('This post is all rights reserved and cannot be forked.');
          setLoading(false);
          return;
        }
      }

      const originalLicense = (post.license as LicenseOption) || DEFAULT_LICENSE;
      const shareAlike = originalLicense === 'cc-by-sa';
      setIsShareAlike(shareAlike);

      const { text: displayDescription } = await convertMentionsToUsernames(post.description ?? '');

      const loadedData: LoadedPostData = {
        title: post.title ?? '',
        description: displayDescription,
        expression: post.expression ?? '',
        mode: (post.mode as ModeOption) || ModeOption.Float,
        sampleRate: post.sample_rate || DEFAULT_SAMPLE_RATE,
        license: mode === 'fork' && shareAlike ? 'cc-by-sa' : originalLicense,
        isDraft: Boolean(post.is_draft),
        profileId: post.profile_id,
        publishedAt: post.published_at,
        originalAuthor: post.profiles?.username ?? null,
      };

      setData(loadedData);
      setLoading(false);
    };

    void loadPost();

    return () => {
      cancelled = true;
    };
  }, [postId, userId, mode, enabled]);

  return { data, loading, error, isShareAlike };
}
