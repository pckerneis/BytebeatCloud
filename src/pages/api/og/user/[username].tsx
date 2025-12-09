import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default async function handler(req: NextRequest) {
  let fontData: ArrayBuffer | null = null;
  try {
    const fontRes = await fetch(
      'https://fonts.gstatic.com/s/inconsolata/v37/QldgNThLqRwH-OJ1UHjlKENVzkWGVkL3GZQmAwLYxYWI2qfdm7Lpp4U8aRo.ttf',
    );
    if (fontRes.ok) {
      fontData = await fontRes.arrayBuffer();
    }
  } catch {
    // Font loading failed
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const username = decodeURIComponent(pathParts[pathParts.length - 1] || 'user');

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
        <div
          style={{
            display: 'flex',
            fontSize: '28px',
            fontWeight: 700,
            color: '#7b34ff',
          }}
        >
          BytebeatCloud
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: '56px',
              color: '#a0a0a0',
              marginBottom: '16px',
            }}
          >
            Listen to bytebeat expressions by
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: '72px',
              fontWeight: 700,
              color: 'white',
              padding: '16px 40px',
              borderRadius: '16px',
            }}
          >
            @{username.length > 30 ? username.slice(0, 30) + '...' : username}
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
