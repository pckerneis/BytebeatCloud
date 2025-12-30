import { createHash } from 'crypto';
import { Post } from './types';

export interface RenderConfig {
  expression: string;
  mode: string;
  sampleRate: number;
  prerenderDuration: number;
}

export function generateRenderSignature(config: RenderConfig): string {
  const data = JSON.stringify({
    expression: config.expression,
    mode: config.mode,
    sampleRate: config.sampleRate,
    prerenderDuration: config.prerenderDuration,
  });

  return createHash('sha256').update(data).digest('hex');
}

export function getRenderConfigFromPost(post: Post, defaultDuration: number): RenderConfig {
  return {
    expression: post.expression,
    mode: post.mode,
    sampleRate: post.sample_rate,
    prerenderDuration: post.prerender_duration ?? defaultDuration,
  };
}

export function needsRerender(post: Post, defaultDuration: number): boolean {
  // If never rendered, needs render
  if (!post.pre_rendered || !post.prerender_signature) {
    return true;
  }

  // Calculate current signature based on post properties
  const currentConfig = getRenderConfigFromPost(post, defaultDuration);
  const currentSignature = generateRenderSignature(currentConfig);

  // If signature changed, needs re-render
  return currentSignature !== post.prerender_signature;
}
