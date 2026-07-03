export const dynamic = 'force-dynamic';

/**
 * API Route: /api/hiring/jobs
 *  GET  — list the tenant's hiring jobs (excludes soft-deleted) with per-job
 *         candidate counts.
 *  POST — create a job from { title, description, location?, language? }.
 *         Generates a unique public slug. Everything else (ad kit, screeners)
 *         comes later via /generate.
 *
 * Auth: requireHiringAdmin (Bearer + HIRING_ADMIN_ROLES + features.hiring gate).
 * Tenant isolation: explicit .eq('tenant_id', ...) on every query.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireHiringAdmin, logHiringEvent } from '@/lib/hiring/api-guard';
import { generateUniqueJobSlug } from '@/lib/hiring/slug';

export async function GET(request: NextRequest) {
  const guard = await requireHiringAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { data: jobs, error } = await supabaseAdmin
      .from('hiring_jobs')
      .select('*')
      .eq('tenant_id', guard.tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('hiring/jobs GET error:', error);
      return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 });
    }

    // Per-job candidate counts (excluding soft-deleted candidates)
    const countByJob: Record<string, number> = {};
    if (jobs && jobs.length > 0) {
      const { data: candidateRows } = await supabaseAdmin
        .from('hiring_candidates')
        .select('job_id')
        .eq('tenant_id', guard.tenantId)
        .is('deleted_at', null);
      for (const row of candidateRows || []) {
        countByJob[row.job_id] = (countByJob[row.job_id] || 0) + 1;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        jobs: (jobs || []).map((j) => ({ ...j, candidate_count: countByJob[j.id] || 0 })),
      },
    });
  } catch (err) {
    console.error('Unexpected error in hiring/jobs GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireHiringAdmin(request);
  if (!guard.ok) return guard.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = String(body?.title || '').trim();
  const description = String(body?.description || '').trim();
  const location = body?.location ? String(body.location).trim() : null;
  const language = body?.language ? String(body.language).trim().toLowerCase() : 'en';

  if (!title) {
    return NextResponse.json({ error: 'Job title is required' }, { status: 400 });
  }
  if (title.length > 200) {
    return NextResponse.json({ error: 'Job title is too long (max 200 characters)' }, { status: 400 });
  }
  if (!/^[a-z]{2}(-[a-z0-9]{2,8})?$/i.test(language)) {
    return NextResponse.json({ error: 'Invalid language code' }, { status: 400 });
  }

  try {
    const slug = await generateUniqueJobSlug(title);

    const { data: job, error } = await supabaseAdmin
      .from('hiring_jobs')
      .insert({
        tenant_id: guard.tenantId,
        title,
        description,
        location,
        language,
        slug,
        status: 'draft',
        created_by: guard.userId,
      })
      .select('*')
      .single();

    if (error || !job) {
      console.error('hiring/jobs POST insert error:', error);
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
    }

    logHiringEvent({
      tenant_id: guard.tenantId,
      job_id: job.id,
      event_type: 'job_created',
      actor_id: guard.userId,
      meta: { title },
    });

    return NextResponse.json({ success: true, data: { job } }, { status: 201 });
  } catch (err) {
    console.error('Unexpected error in hiring/jobs POST:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
