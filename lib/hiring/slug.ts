/**
 * Hiring module — public apply-URL slug generation.
 * Slug format: kebab-cased title + short random base36 suffix, e.g.
 * "concrete-laborer-x7k2q". Globally unique (hiring_jobs.slug is UNIQUE —
 * including soft-deleted rows, so we check existence without a deleted_at
 * filter). Server-only (imports supabaseAdmin).
 */
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

/** Kebab-case a job title into a URL-safe base (max ~60 chars). */
export function kebabTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics (Spanish titles)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return base || 'job';
}

function randomSuffix(len = 5): string {
  // base36 from random bytes — URL-safe, lowercase
  return randomBytes(8).readBigUInt64BE().toString(36).slice(0, len);
}

/**
 * Generate a slug that does not collide with any existing hiring_jobs.slug.
 * Collision odds per attempt are ~1/36^5; retry a few times for safety.
 */
export async function generateUniqueJobSlug(title: string): Promise<string> {
  const base = kebabTitle(title);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = `${base}-${randomSuffix()}`;
    const { data } = await supabaseAdmin
      .from('hiring_jobs')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!data) return slug;
  }
  // Last resort: longer suffix, effectively collision-proof
  return `${base}-${randomSuffix(5)}${randomSuffix(5)}`;
}
