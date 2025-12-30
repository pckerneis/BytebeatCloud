import * as dotenv from 'dotenv';
import {
  createSupabaseClient,
  getPostsNeedingRender,
  markPostAsRendered,
  uploadAudioSample,
} from './supabase-client';
import { renderToWav } from './wav-export';
import { ModeOption } from '@shared/model/expression';
import { Post } from './types';

dotenv.config();

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '5', 10);
const RENDER_DURATION = parseInt(process.env.RENDER_DURATION || '120', 10);
const FADE_IN_SECONDS = parseFloat(process.env.FADE_IN_SECONDS || '0.1');
const FADE_OUT_SECONDS = parseFloat(process.env.FADE_OUT_SECONDS || '0.5');

function mapModeToEnum(mode: string): ModeOption {
  switch (mode.toLowerCase()) {
    case 'uint8':
      return ModeOption.Uint8;
    case 'int8':
      return ModeOption.Int8;
    case 'float':
      return ModeOption.Float;
    default:
      console.warn(`Unknown mode: ${mode}, defaulting to uint8`);
      return ModeOption.Uint8;
  }
}

async function renderPost(post: Post): Promise<Buffer> {
  console.log(`Rendering post ${post.id}: "${post.title}"`);

  const mode = mapModeToEnum(post.mode);
  const sampleRate = post.sample_rate || 8000;

  try {
    const wavBuffer = renderToWav({
      expression: post.expression,
      mode,
      sampleRate,
      duration: post.prerender_duration ?? RENDER_DURATION,
      fadeIn: FADE_IN_SECONDS,
      fadeOut: FADE_OUT_SECONDS,
    });

    console.log(`Successfully rendered post ${post.id} (${wavBuffer.length} bytes)`);
    return wavBuffer;
  } catch (error) {
    console.error(`Failed to render post ${post.id}:`, error);
    throw error;
  }
}

async function processPost(post: Post): Promise<void> {
  const supabase = createSupabaseClient();

  try {
    const wavBuffer = await renderPost(post);
    const publicUrl = await uploadAudioSample(supabase, post.id, wavBuffer);
    await markPostAsRendered(supabase, post.id, publicUrl);
    console.log(`✓ Post ${post.id} processed successfully. URL: ${publicUrl}`);
  } catch (error) {
    console.error(`✗ Failed to process post ${post.id}:`, error);
    throw error;
  }
}

async function processBatch(): Promise<void> {
  const supabase = createSupabaseClient();

  try {
    const posts = await getPostsNeedingRender(supabase, BATCH_SIZE);

    if (posts.length === 0) {
      console.log('No posts need rendering at this time.');
      return;
    }

    console.log(`Found ${posts.length} post(s) to render`);

    for (const post of posts) {
      try {
        await processPost(post);
      } catch (error) {
        console.error(`Skipping post ${post.id} due to error`);
      }
    }

    console.log(`Batch complete. Processed ${posts.length} post(s).`);
  } catch (error) {
    console.error('Error during batch processing:', error);
  }
}

async function main(): Promise<void> {
  console.log('=== Bytebeat Renderer Worker ===');
  console.log(`Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Render duration: ${RENDER_DURATION}s`);
  console.log(`Fade in: ${FADE_IN_SECONDS}s, Fade out: ${FADE_OUT_SECONDS}s`);
  console.log('================================\n');

  try {
    createSupabaseClient();
    console.log('✓ Supabase connection established\n');
  } catch (error) {
    console.error('✗ Failed to connect to Supabase:', error);
    process.exit(1);
  }

  console.log('Starting worker loop...\n');

  while (true) {
    await processBatch();
    console.log(`\nWaiting ${POLL_INTERVAL_MS / 1000}s until next poll...\n`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
