/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@hotel-app/ui', '@hotel-app/api-client', '@hotel-app/core'],
  eslint: { ignoreDuringBuilds: true },
};
module.exports = nextConfig;
