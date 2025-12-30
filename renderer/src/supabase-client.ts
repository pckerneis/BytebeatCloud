import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Post } from './types';

export function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_KEY');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getPostsNeedingRender(
  client: SupabaseClient,
  limit: number = 10,
): Promise<Post[]> {
  // Fetch all non-draft posts that either:
  // 1. Have never been rendered (pre_rendered is null or false)
  // 2. Have been rendered (we'll check signature in the renderer logic)
  const { data, error } = await client
    .from('posts')
    .select('*')
    .eq('is_draft', false)
    .order('created_at', { ascending: true })
    .limit(limit * 2); // Fetch more since we'll filter by signature

  if (error) {
    throw new Error(`Failed to fetch posts: ${error.message}`);
  }

  return data || [];
}

export async function markPostAsRendered(
  client: SupabaseClient,
  postId: string,
  sampleUrl: string,
  signature: string,
  duration: number,
): Promise<void> {
  const { error } = await client
    .from('posts')
    .update({
      pre_rendered: true,
      sample_url: sampleUrl,
      prerender_signature: signature,
      prerender_duration: duration,
    })
    .eq('id', postId);

  if (error) {
    throw new Error(`Failed to update post ${postId}: ${error.message}`);
  }
}

export async function uploadAudioSample(
  client: SupabaseClient,
  postId: string,
  audioBuffer: Buffer,
): Promise<string> {
  const fileName = `${postId}.wav`;
  const filePath = `samples/${fileName}`;

  const { error: uploadError } = await client.storage
    .from('audio-samples')
    .upload(filePath, audioBuffer, {
      contentType: 'audio/wav',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload audio sample: ${uploadError.message}`);
  }

  const { data: urlData } = client.storage.from('audio-samples').getPublicUrl(filePath);

  return urlData.publicUrl;
}
