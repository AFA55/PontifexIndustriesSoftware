export const dynamic = 'force-dynamic';

/**
 * POST /api/hiring/public/resume — PUBLIC (no session).
 *
 * Candidate resume upload from the apply page (app/apply/[slug]).
 * multipart/form-data: `file` (pdf/doc/docx/image, ≤10MB) + `slug` (the job).
 *
 * Server-side upload to the PRIVATE `hiring-resumes` bucket (resumes are PII —
 * reads happen via signed URLs in the admin pipeline). Mirrors the
 * timecard-photo pattern: validate size + MIME server-side, never trust the
 * client, return the storage PATH (not a URL). Path shape:
 *   `${slug}/${crypto.randomUUID()}-${sanitizedFilename}`
 * The client passes the returned path as `resume_path` in the apply POST.
 *
 * Gated on the slug resolving to an ACTIVE job so the endpoint can't be used
 * as a generic file drop.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const BUCKET = 'hiring-resumes';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

// Light in-memory abuse guard: 20 uploads / hour / IP.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const uploadHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (uploadHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    uploadHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  uploadHits.set(ip, hits);
  return false;
}

/** Keep the original filename readable but storage-safe. Leading dots are
 * stripped so a name like ".." can't survive into the stored path (the apply
 * route rejects any path containing '..', which would orphan the upload). */
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() || 'resume';
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 80);
  return cleaned || 'resume';
}

export async function POST(request: NextRequest) {
  try {
    // x-real-ip is platform-set on Vercel (single value); the LEFTMOST
    // x-forwarded-for entry is client-spoofable, so fall back to the
    // rightmost (appended by the edge) — guardian finding Jul 3.
    const ip =
      request.headers.get('x-real-ip')?.trim() ||
      request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
      'unknown';
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Too many uploads. Please try again later.' }, { status: 429 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const slug = String(formData.get('slug') ?? '').trim();
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json({ error: 'Invalid job' }, { status: 400 });
    }

    const file = formData.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'file missing' }, { status: 400 });
    }

    const mime = (file.type || '').split(';')[0].toLowerCase();
    if (!ALLOWED_MIMES.has(mime)) {
      return NextResponse.json(
        { error: 'Please upload a PDF, Word document, or image.' },
        { status: 415 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (${Math.round(file.size / (1024 * 1024))}MB, max 10MB)` },
        { status: 413 }
      );
    }

    // Only accept uploads for a live, accepting job.
    const { data: job } = await supabaseAdmin
      .from('hiring_jobs')
      .select('id')
      .eq('slug', slug)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle();
    if (!job) {
      return NextResponse.json({ error: 'This position is not accepting applications.' }, { status: 404 });
    }

    const originalName = file instanceof File ? file.name : 'resume';
    const path = `${slug}/${crypto.randomUUID()}-${sanitizeFilename(originalName)}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: false });

    if (uploadError) {
      console.error('[hiring/resume] storage error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload resume' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { path } });
  } catch (err) {
    console.error('[hiring/resume] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
