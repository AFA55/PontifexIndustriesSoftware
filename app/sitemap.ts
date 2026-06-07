import type { MetadataRoute } from 'next';

const SITE = 'https://www.pontifexindustries.com';

/**
 * sitemap.xml — public marketing + legal pages only. App/auth routes are excluded
 * (and disallowed in robots.ts).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/patriot`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE}/request-demo`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE}/support`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
