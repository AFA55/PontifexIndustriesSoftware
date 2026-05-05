/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip type-check + lint during `next build`. We catch both locally:
  //   - TypeScript: husky pre-commit hook runs `npx tsc --noEmit` and blocks bad commits.
  //   - ESLint:     `npm run lint` available; not enforced (lint warnings shouldn't block deploys).
  // Skipping these on Vercel cuts ~30-60s off every production build, which was
  // the dominant line item in our cloud bill (build minutes >85% of cost).
  // If the pre-commit hook is bypassed (`--no-verify`), TS errors won't be caught
  // until runtime — keep the hook in place.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // Image optimization for Supabase Storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'klatddoyncxidgqtcjnu.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.in',
      },
    ],
  },
  // Ensure these packages run server-side only
  serverExternalPackages: ['@supabase/supabase-js', 'pg'],

  // Security headers for production
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=(self)',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig
