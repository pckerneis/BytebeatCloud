/** @type {import('next').NextConfig} */
const repoBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

console.log('NEXT_PUBLIC_SUPABASE_URL at dev start:', process.env.NEXT_PUBLIC_SUPABASE_URL);

const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  ...(repoBasePath
    ? {
        basePath: `/${repoBasePath}`,
        assetPrefix: `/${repoBasePath}/`,
      }
    : {}),
};

module.exports = nextConfig;
