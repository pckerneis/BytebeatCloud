/** @type {import('next').NextConfig} */
const repoBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  reactStrictMode: true,
  ...(repoBasePath
    ? {
        basePath: `/${repoBasePath}`,
        assetPrefix: `/${repoBasePath}/`,
      }
    : {}),
};

module.exports = nextConfig;
