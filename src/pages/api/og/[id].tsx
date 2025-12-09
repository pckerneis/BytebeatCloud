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
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1a20',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Logo / Brand */}
        <div
          style={{
            position: 'absolute',
            top: '30px',
            left: '40px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontSize: '28px',
              fontWeight: 700,
              color: '#7b34ff',
            }}
          >
            BytebeatCloud
          </span>
        </div>

        {/* Play button circle */}
        <div
          style={{
            paddingLeft: '40px',
            paddingRight: '40px',
            paddingTop: '20px',
            paddingBottom: '20px',
            borderRadius: '16px',
            background: '#7b34ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '30px',
          }}
        >
          <span
            style={{
              fontSize: '40px',
              fontWeight: 700,
              color: 'white',
            }}
          >
            Play
          </span>
        </div>

        {/* Waveform visualization using bars */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: `${waveformHeight}px`,
            marginBottom: '30px',
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

        {/* Title */}
        <div
          style={{
            display: 'flex',
            fontSize: '48px',
            fontWeight: 700,
            color: 'white',
            textAlign: 'center',
            maxWidth: '1000px',
            marginBottom: '12px',
          }}
        >
          {title.length > 40 ? title.slice(0, 40) + '...' : title}
        </div>

        {/* Author */}
        <div
          style={{
            display: 'flex',
            fontSize: '28px',
            color: '#a0a0a0',
            textAlign: 'center',
          }}
        >
          by {author}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
