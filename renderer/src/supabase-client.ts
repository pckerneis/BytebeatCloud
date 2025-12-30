import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Post } from './types';

export function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_KEY',
    );
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
  // Fetch non-draft posts that have never been rendered
  const { data: unrenderedData, error: unrenderedError } = await client
    .from('posts')
    .select('*')
    .eq('is_draft', false)
    .or('pre_rendered.is.null,pre_rendered.eq.false')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (unrenderedError) {
    throw new Error(`Failed to fetch unrendered posts: ${unrenderedError.message}`);
  }

  // Fetch posts that were updated after their last render
  // This catches posts where expression/settings changed
  // Note: Supabase doesn't support column-to-column comparison, so we fetch all rendered posts
  // and filter in application code
  const { data: renderedData, error: renderedError } = await client
    .from('posts')
    .select('*')
    .eq('is_draft', false)
    .eq('pre_rendered', true)
    .not('last_rendered_at', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit * 3); // Fetch more since we'll filter in code

  if (renderedError) {
    throw new Error(`Failed to fetch rendered posts: ${renderedError.message}`);
  }

  // Filter posts where updated_at > last_rendered_at
  const staleData = (renderedData || [])
    .filter((post) => {
      if (!post.last_rendered_at) return false;
      return new Date(post.updated_at) > new Date(post.last_rendered_at);
    })
    .slice(0, limit);

  // Combine both sets, prioritizing unrendered posts
  return [...(unrenderedData || []), ...staleData];
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
      last_rendered_at: new Date().toISOString(),
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
