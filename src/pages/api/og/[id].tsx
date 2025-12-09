import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ModeOption } from '../../../model/expression';

export const config = {
  runtime: 'edge',
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Generate a simple waveform from the bytebeat expression
function generateWaveformSamples(expression: string, sampleCount: number, float: boolean): number[] {
  const samples: number[] = [];

  try {
    // Create a safe evaluation function for the bytebeat expression
    const fn = new Function('t', `return ${expression}`);

    for (let i = 0; i < sampleCount; i++) {
      const t = i * 100; // Sample at intervals to get a representative waveform
      try {
        let value = fn(t);
        // Normalize to [-1, 1] range (bytebeat typically outputs 0-255)
        if (typeof value === 'number' && Number.isFinite(value)) {
          if (!float) value = (value & 255) / 127.5 - 1;
          samples.push(Math.max(-1, Math.min(1, value)));
        } else {
          samples.push(0);
        }
      } catch {
        samples.push(0);
      }
    }
  } catch {
    // If expression fails to compile, return flat line
    for (let i = 0; i < sampleCount; i++) {
      samples.push(0);
    }
  }

  return samples;
}

// Create SVG path for waveform
function createWaveformPath(
  samples: number[],
  width: number,
  height: number,
  yOffset: number,
): string {
  if (samples.length === 0) return '';

  const centerY = yOffset + height / 2;
  const amplitude = height * 0.4;

  let path = '';
  for (let i = 0; i < samples.length; i++) {
    const x = (i / (samples.length - 1)) * width;
    const y = centerY - samples[i] * amplitude;

    if (i === 0) {
      path += `M ${x} ${y}`;
    } else {
      path += ` L ${x} ${y}`;
    }
  }

  return path;
}

export default async function handler(req: NextRequest) {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (!id) {
    return new Response('Missing post ID', { status: 400 });
  }

  // Fetch post data from Supabase
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
  const waveformSamples = generateWaveformSamples(post.expression, 100, post.mode === ModeOption.Float);
  const waveformPath = createWaveformPath(waveformSamples, 1000, 200, 220);

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
          position: 'relative',
        }}
      >
        {/* Background pattern */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.1,
            backgroundImage:
              'radial-gradient(circle at 25% 25%, #e94560 0%, transparent 50%), radial-gradient(circle at 75% 75%, #0f3460 0%, transparent 50%)',
          }}
        />

        {/* Logo / Brand */}
        <div
          style={{
            position: 'absolute',
            top: '30px',
            left: '40px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              fontSize: '28px',
              fontWeight: 700,
              color: '#e94560',
              letterSpacing: '-0.5px',
            }}
          >
            BytebeatCloud
          </div>
        </div>

        {/* Play button circle */}
        <div
          style={{
            width: '120px',
            height: '120px',
            borderRadius: '60px',
            background: 'linear-gradient(135deg, #e94560 0%, #c73e54 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(233, 69, 96, 0.4)',
            marginBottom: '20px',
          }}
        >
          {/* Play triangle */}
          <div
            style={{
              width: 0,
              height: 0,
              borderTop: '25px solid transparent',
              borderBottom: '25px solid transparent',
              borderLeft: '40px solid white',
              marginLeft: '8px',
            }}
          />
        </div>

        {/* Waveform visualization */}
        <svg
          width="1000"
          height="200"
          style={{
            marginBottom: '20px',
          }}
        >
          {/* Waveform line */}
          <path
            d={waveformPath}
            fill="none"
            stroke="#e94560"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Glow effect */}
          <path
            d={waveformPath}
            fill="none"
            stroke="#e94560"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.3"
          />
        </svg>

        {/* Title */}
        <div
          style={{
            fontSize: '48px',
            fontWeight: 700,
            color: 'white',
            textAlign: 'center',
            maxWidth: '1000px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: '12px',
          }}
        >
          {title}
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
