/** @type {import('next').NextConfig} */
const nextConfig = {
  // Image optimization for Supabase Storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'klatddoyncxidgqtcjnu.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

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
