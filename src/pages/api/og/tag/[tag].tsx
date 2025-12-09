import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: NextRequest) {
  let fontData: ArrayBuffer | null = null;
  try {
    const fontRes = await fetch(
      'https://fonts.gstatic.com/s/inconsolata/v37/QldgNThLqRwH-OJ1UHjlKENVzkWGVkL3GZQmAwLYxYWI2qfdm7Lpp4U8aRo.ttf'
    );
    if (fontRes.ok) {
      fontData = await fontRes.arrayBuffer();
    }
  } catch {
    // Font loading failed
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const tag = decodeURIComponent(pathParts[pathParts.length - 1] || 'tag');

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
            color: '#7b34ff'
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
            Explore bytebeat expressions
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
            #{tag.length > 30 ? tag.slice(0, 30) + '...' : tag}
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
