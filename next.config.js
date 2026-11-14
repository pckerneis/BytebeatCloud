/** @type {import('next').NextConfig} */
const repoBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const ONE_DAY = 86400;
const ONE_WEEK = 604800;
const ONE_YEAR = 31536000;

const nextConfig = {
  reactStrictMode: true,
  ...(repoBasePath
    ? {
        basePath: `/${repoBasePath}`,
        assetPrefix: `/${repoBasePath}/`,
      }
    : {}),
  // Browser caching for files in /public (Vercel defaults them to max-age=0,
  // so every load revalidates and counts as an Edge Request).
  async headers() {
    const cache = (value) => [{ key: 'Cache-Control', value }];
    return [
      { source: '/favicon.ico', headers: cache(`public, max-age=${ONE_WEEK}`) },
      { source: '/icons/:path*', headers: cache(`public, max-age=${ONE_WEEK}`) },
      { source: '/images/:path*', headers: cache(`public, max-age=${ONE_WEEK}`) },
      // Always requested with ?v=<commit sha>, so it can be cached forever.
      {
        source: '/bytebeat-worklet.js',
        headers: cache(`public, max-age=${ONE_YEAR}, immutable`),
      },
      { source: '/manifest.webmanifest', headers: cache(`public, max-age=${ONE_DAY}`) },
      { source: '/robots.txt', headers: cache(`public, max-age=${ONE_DAY}`) },
      // The service worker script must stay revalidated so updates are picked up.
      { source: '/sw.js', headers: cache('no-cache') },
    ];
  },
};

module.exports = nextConfig;
