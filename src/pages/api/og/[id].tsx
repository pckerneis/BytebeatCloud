import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const expressionApi = `
const E = Math.E;
const LN10 = Math.LN10;
const LN2 = Math.LN2;
const LOG2E = Math.LOG2E;
const PI = Math.PI;
const SQRT1_2 = Math.SQRT1_2;
const SQRT2 = Math.SQRT2;
const TAU = Math.PI * 2;
const abs = Math.abs;
const acos = Math.acos;
const acosh = Math.acosh;
const asin = Math.asin;
const asinh = Math.asinh;
const atan = Math.atan;
const atanh = Math.atanh;
const cbrt = Math.cbrt;
const ceil = Math.ceil;
const clz32 = Math.clz32;
const cos = Math.cos;
const cosh = Math.cosh;
const exp = Math.exp;
const expm1 = Math.expm1;
const floor = Math.floor;
const fround = Math.fround;
const hypot = Math.hypot;
const imul = Math.imul;
const log = Math.log;
const log10 = Math.log10;
const log1p = Math.log1p;
const log2 = Math.log2;
const max = Math.max;
const min = Math.min;
const pow = Math.pow;
const random = Math.random;
const round = Math.round;
const sign = Math.sign;
const sin = Math.sin;
const sinh = Math.sinh;
const sqrt = Math.sqrt;
const tan = Math.tan;
const tanh = Math.tanh;
const trunc = Math.trunc;
const SR = sr;
`;

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
    const fn = new Function('t', 'sr', `${expressionApi}\nreturn ${expression}`);

    for (let i = 0; i < sampleCount; i++) {
      const t = i * 100;
      try {
        let value = fn(t, 44100);
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
