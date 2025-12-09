import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';


export const config = {
  runtime: 'edge',
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function generateWaveformSamples(expression: string, sampleCount: number): number[] {
  const samples: number[] = [];
  
  // Create a simple hash from the expression
  let hash = 0;
  for (let i = 0; i < expression.length; i++) {
    hash = ((hash << 5) - hash + expression.charCodeAt(i)) | 0;
  }
  
  // Use hash to seed a deterministic pattern
  const seed = Math.abs(hash);
  const frequency1 = ((seed % 7) + 1) * 0.1;
  const frequency2 = ((seed % 11) + 1) * 0.05;
  const frequency3 = ((seed % 21) + 1) * 0.03;
  const phase = (seed % 100) / 100 * Math.PI * 2;
  
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    // Combine sine waves with different frequencies for visual variety
    const value = Math.sin(t * Math.PI * 2 * frequency1 * 10 + phase) * 0.6 +
                  Math.sin(t * Math.PI * 2 * frequency2 * 20 + phase * 2) * 0.4 +
                  Math.sin(t * Math.PI * 2 * frequency3 * 20 + phase * 2) * 0.2;
    samples.push(value);
  }
  
  return samples;
}

export default async function handler(req: NextRequest) {
  // Load font inside handler to properly handle errors
  let fontData: ArrayBuffer | null = null;
  try {
    const fontRes = await fetch(
      'https://fonts.gstatic.com/s/inconsolata/v37/QldgNThLqRwH-OJ1UHjlKENVzkWGVkL3GZQmAwLYxYWI2qfdm7Lpp4U8aRo.ttf'
    );
    if (fontRes.ok) {
      fontData = await fontRes.arrayBuffer();
    }
  } catch {
    // Font loading failed, will use fallback
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (!id) {
    return new Response('Missing post ID', { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: post, error } = await supabase
    .from('posts_with_meta')
    .select('id, title, expression, author_username, mode')
    .eq('id', id)
    .maybeSingle();

  if (error || !post) {
    return new Response('Post not found', { status: 404 });
  }

  const title = post.title || '(untitled)';
  const author = post.author_username ? `@${post.author_username}` : '@unknown';

  // Generate waveform samples (deterministic pattern based on expression)
  const waveformSamples = generateWaveformSamples(post.expression, 80);

  // Waveform bar dimensions
  const barWidth = 10;
  const barGap = 2;
  const waveformHeight = 120;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: '#1a1a20',
          fontFamily: 'Inconsolata',
          padding: '30px 40px',
        }}
      >
        {/* BytebeatCloud */}
        <div
          style={{
            display: 'flex',
            fontSize: '28px',
            fontWeight: 700,
            color: '#7b34ff',
            marginBottom: '52px',
          }}
        >
          BytebeatCloud
        </div>

        {/* Content container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            width: '1000px',
            marginLeft: '60px',
          }}
        >
          {/* Author */}
          <div
            style={{
              display: 'flex',
              fontSize: '30px',
              color: '#a0a0a0',
              marginBottom: '8px',
            }}
          >
            {author}
          </div>

          {/* Title */}
          <div
            style={{
              display: 'flex',
              fontSize: '42px',
              fontWeight: 700,
              color: 'white',
              marginBottom: '60px',
            }}
          >
            {title.length > 50 ? title.slice(0, 50) + '...' : title}
          </div>

          {/* Waveform */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              height: `${waveformHeight}px`,
              marginBottom: '60px',
              marginLeft: '20px'
            }}
          >
            {waveformSamples.map((sample, i) => {
              const height = Math.max(4, Math.abs(sample) * waveformHeight);
              return (
                <div
                  key={i}
                  style={{
                    width: `${barWidth}px`,
                    height: `${height}px`,
                    backgroundColor: '#7b34ff',
                    marginLeft: i === 0 ? '0' : `${barGap}px`,
                    borderRadius: '2px',
                  }}
                />
              );
            })}
          </div>

          {/* Expression preview */}
          <div
            style={{
              display: 'flex',
              fontSize: '26px',
              fontFamily: 'monospace',
              color: '#c2c2c7ff',
              background: '#101013ff',
              padding: '12px 16px',
              borderRadius: '8px',
              width: '1000px',
              maxHeight: '90px',
              overflow: 'hidden',
              lineHeight: 1.4,
              wordBreak: 'break-all',
            }}
          >
            {post.expression.length > 120 ? post.expression.slice(0, 120) + '...' : post.expression}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      ...(fontData && {
        fonts: [
          {
            name: 'Inconsolata',
            data: fontData,
            style: 'normal' as const,
            weight: 400,
          },
        ],
      }),
    },
  );
}
