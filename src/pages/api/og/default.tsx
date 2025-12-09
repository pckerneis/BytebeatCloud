import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

export const config = {
  runtime: 'edge',
};

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
          fontFamily: 'Inconsolata',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: '80px',
            fontWeight: 700,
            color: '#7b34ff',
            marginBottom: '24px',
          }}
        >
          BytebeatCloud
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: '42px',
            color: '#a0a0a0',
          }}
        >
          Create and share bytebeat music
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
