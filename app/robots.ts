import type { MetadataRoute } from 'next';

const SITE = 'https://www.pontifexindustries.com';

/**
 * robots.txt — allow public marketing/legal pages and AI crawlers; keep the app,
 * auth, and API surfaces out of the index.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    '/dashboard',
    '/api',
    '/login',
    '/company-login',
    '/shop-login',
    '/setup',
    '/setup-account',
    '/offer',
    '/portal',
    '/nfc-clock',
  ];

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      // Explicitly welcome major AI crawlers to the public pages.
      { userAgent: 'GPTBot', allow: '/', disallow },
      { userAgent: 'ClaudeBot', allow: '/', disallow },
      { userAgent: 'PerplexityBot', allow: '/', disallow },
      { userAgent: 'Google-Extended', allow: '/', disallow },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
