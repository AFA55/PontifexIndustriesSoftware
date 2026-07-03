export const dynamic = 'force-dynamic';

/**
 * API Route: /api/hiring/candidates/[id]
 *  GET   — candidate detail: { candidate, responses, events (ordered),
 *          comments (with author_name via profiles join) }.
 *  PATCH — { status } (unreviewed | shortlisted | rejected); logs a
 *          hiring_events 'status_changed' row with actor_id.
 *
 * Auth: requireHiringAdmin. Tenant isolation via explicit tenant_id filters.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireHiringAdmin, logHiringEvent } from '@/lib/hiring/api-guard';
import { signStoragePath } from '@/lib/signed-urls';
import { CANDIDATE_STATUSES, type CandidateStatus } from '@/lib/hiring/types';

async function fetchCandidate(tenantId: string, candidateId: string) {
  const { data } = await supabaseAdmin
    .from('hiring_candidates')
    .select('*')
    .eq('id', candidateId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  return data;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireHiringAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  try {
    const candidate = await fetchCandidate(guard.tenantId, id);
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

    const [{ data: responses }, { data: events }, { data: commentRows }] = await Promise.all([
      supabaseAdmin
        .from('hiring_candidate_responses')
        .select('id, candidate_id, question_id, question_text, answer, created_at')
        .eq('candidate_id', id)
        .eq('tenant_id', guard.tenantId)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('hiring_events')
        .select('id, job_id, candidate_id, event_type, meta, actor_id, created_at')
        .eq('candidate_id', id)
        .eq('tenant_id', guard.tenantId)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('hiring_comments')
        .select('id, candidate_id, author_id, body, created_at, profiles:author_id (full_name)')
        .eq('candidate_id', id)
        .eq('tenant_id', guard.tenantId)
        .order('created_at', { ascending: true }),
    ]);

    const comments = (commentRows || []).map((c: any) => ({
      id: c.id,
      candidate_id: c.candidate_id,
      author_id: c.author_id,
      author_name: c.profiles?.full_name || 'Former team member',
      body: c.body,
      created_at: c.created_at,
    }));

    // Resume: never hand the raw storage path to the UI — mint a short-lived
    // signed URL, and ONLY after verifying the path's slug prefix belongs to a
    // job of THIS tenant (guards against a stored cross-tenant path becoming a
    // confused-deputy file read; the apply route validates on write, this
    // validates on read — defense in depth).
    let resumeSignedUrl: string | null = null;
    if (candidate.resume_url) {
      const path = String(candidate.resume_url);
      const slugPrefix = path.split('/')[0] || '';
      const safeShape = slugPrefix.length > 0 && !path.includes('..') && !path.startsWith('/');
      if (safeShape) {
        const { data: ownerJob } = await supabaseAdmin
          .from('hiring_jobs')
          .select('id')
          .eq('slug', slugPrefix)
          .eq('tenant_id', guard.tenantId)
          .maybeSingle();
        if (ownerJob) {
          resumeSignedUrl = await signStoragePath('hiring-resumes', path, 600);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        candidate,
        resume_signed_url: resumeSignedUrl,
        responses: responses || [],
        events: events || [],
        comments,
      },
    });
  } catch (err) {
    console.error('Unexpected error in hiring/candidates/[id] GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireHiringAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const status = body?.status as CandidateStatus;
  if (!CANDIDATE_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${CANDIDATE_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const existing = await fetchCandidate(guard.tenantId, id);
    if (!existing) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

    const { data: candidate, error } = await supabaseAdmin
      .from('hiring_candidates')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', guard.tenantId)
      .select('*')
      .single();

    if (error || !candidate) {
      console.error('hiring candidate PATCH error:', error);
      return NextResponse.json({ error: 'Failed to update candidate' }, { status: 500 });
    }

    logHiringEvent({
      tenant_id: guard.tenantId,
      job_id: candidate.job_id,
      candidate_id: id,
      event_type: 'status_changed',
      actor_id: guard.userId,
      meta: { from: existing.status, to: status },
    });

    return NextResponse.json({ success: true, data: { candidate } });
  } catch (err) {
    console.error('Unexpected error in hiring/candidates/[id] PATCH:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
