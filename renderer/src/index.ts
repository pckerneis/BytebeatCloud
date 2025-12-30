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
import { needsRerender, getRenderConfigFromPost, generateRenderSignature } from './signature';
import { runWithTimeout, TimeoutError } from './timeout';

dotenv.config();

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '5', 10);
const RENDER_DURATION = parseInt(process.env.RENDER_DURATION || '120', 10);
const FADE_IN_SECONDS = parseFloat(process.env.FADE_IN_SECONDS || '0.1');
const FADE_OUT_SECONDS = parseFloat(process.env.FADE_OUT_SECONDS || '0.5');
const RENDER_TIMEOUT_MS = parseInt(process.env.RENDER_TIMEOUT_MS || '120000', 10);

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
    const wavBuffer = await runWithTimeout(
      () => renderToWav({
        expression: post.expression,
        mode,
        sampleRate,
        duration: post.prerender_duration ?? RENDER_DURATION,
        fadeIn: FADE_IN_SECONDS,
        fadeOut: FADE_OUT_SECONDS,
      }),
      RENDER_TIMEOUT_MS,
      `Rendering timed out after ${RENDER_TIMEOUT_MS}ms (possible infinite loop)`,
    );

    console.log(`Successfully rendered post ${post.id} (${wavBuffer.length} bytes)`);
    return wavBuffer;
  } catch (error) {
    if (error instanceof TimeoutError) {
      console.error(`⏱ Post ${post.id} timed out - likely infinite loop in expression`);
    } else {
      console.error(`Failed to render post ${post.id}:`, error);
    }
    throw error;
  }
}

async function processPost(post: Post): Promise<void> {
  const supabase = createSupabaseClient();

  try {
    const duration = post.prerender_duration ?? RENDER_DURATION;
    const renderConfig = getRenderConfigFromPost(post, RENDER_DURATION);
    const signature = generateRenderSignature(renderConfig);
    
    const wavBuffer = await renderPost(post);
    const publicUrl = await uploadAudioSample(supabase, post.id, wavBuffer);
    await markPostAsRendered(supabase, post.id, publicUrl, signature, duration);
    console.log(`✓ Post ${post.id} processed successfully. URL: ${publicUrl}`);
  } catch (error) {
    console.error(`✗ Failed to process post ${post.id}:`, error);
    throw error;
  }
}

async function processBatch(): Promise<void> {
  const supabase = createSupabaseClient();

  try {
    const allPosts = await getPostsNeedingRender(supabase, BATCH_SIZE);

    // Filter posts that actually need rendering based on signature
    const postsToRender = allPosts.filter(post => needsRerender(post, RENDER_DURATION)).slice(0, BATCH_SIZE);

    if (postsToRender.length === 0) {
      console.log('No posts need rendering at this time.');
      return;
    }

    console.log(`Found ${postsToRender.length} post(s) needing render (checked ${allPosts.length} total)`);

    for (const post of postsToRender) {
      try {
        const reason = !post.pre_rendered ? 'never rendered' : 'signature changed';
        console.log(`Processing post ${post.id} (${reason})`);
        await processPost(post);
      } catch (error) {
        console.error(`Skipping post ${post.id} due to error`);
      }
    }

    console.log(`Batch complete. Processed ${postsToRender.length} post(s).`);
  } catch (error) {
    console.error('Error during batch processing:', error);
  }
}

async function main(): Promise<void> {
  console.log('=== Bytebeat Renderer Worker ===');
  console.log(`Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Render duration: ${RENDER_DURATION}s`);
  console.log(`Render timeout: ${RENDER_TIMEOUT_MS}ms`);
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
