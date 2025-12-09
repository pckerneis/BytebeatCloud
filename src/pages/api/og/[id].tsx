import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Generate waveform samples from bytebeat expression
function generateWaveformSamples(expression: string, sampleCount: number, mode: string): number[] {
  const samples: number[] = [];
  const isFloat = mode === 'float';

  try {
    const fn = new Function('t', `return ${expression}`);

    for (let i = 0; i < sampleCount; i++) {
      const t = i * 100;
      try {
        let value = fn(t);
        if (typeof value === 'number' && Number.isFinite(value)) {
          if (!isFloat) value = (value & 255) / 127.5 - 1;
          samples.push(Math.max(-1, Math.min(1, value)));
        } else {
          samples.push(0);
        }
      } catch {
        samples.push(0);
      }
    }
  } catch {
    for (let i = 0; i < sampleCount; i++) {
      samples.push(0);
    }
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

  // Generate waveform samples
  const waveformSamples = generateWaveformSamples(post.expression, 80, post.mode || 'uint8');

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
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
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
          <div
            style={{
              fontSize: '28px',
              fontWeight: 700,
              color: '#e94560',
            }}
          >
            BytebeatCloud
          </div>
        </div>

        {/* Play button circle */}
        <div
          style={{
            width: '100px',
            height: '100px',
            borderRadius: '50px',
            background: '#e94560',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '30px',
          }}
        >
          {/* Play triangle using borders */}
          <div
            style={{
              width: '0',
              height: '0',
              borderTop: '20px solid transparent',
              borderBottom: '20px solid transparent',
              borderLeft: '32px solid white',
              marginLeft: '6px',
            }}
          />
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
                  backgroundColor: '#e94560',
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
