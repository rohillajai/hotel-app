/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@hotel-app/ui', '@hotel-app/api-client', '@hotel-app/core'],
  eslint: {
    // ESLint runs in CI via `pnpm lint` — don't block the build on warnings
    ignoreDuringBuilds: true,
  },
  experimental: {},
};

module.exports = nextConfig;
