export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/hiring/candidates/[id]/comments
 * Body: { body } (non-empty)
 *
 * Adds an internal, team-only note on a candidate (author = caller).
 * Logs a hiring_events 'comment_added' row (fire-and-forget).
 * Response: { success, data: { comment } } — comment includes author_name.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireHiringAdmin, logHiringEvent } from '@/lib/hiring/api-guard';

const MAX_COMMENT_LEN = 4000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireHiringAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const body = String(payload?.body || '').trim();
  if (!body) return NextResponse.json({ error: 'Comment body is required' }, { status: 400 });
  if (body.length > MAX_COMMENT_LEN) {
    return NextResponse.json({ error: `Comment is too long (max ${MAX_COMMENT_LEN} characters)` }, { status: 400 });
  }

  try {
    const { data: candidate } = await supabaseAdmin
      .from('hiring_candidates')
      .select('id, job_id')
      .eq('id', id)
      .eq('tenant_id', guard.tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

    const { data: comment, error } = await supabaseAdmin
      .from('hiring_comments')
      .insert({
        tenant_id: guard.tenantId,
        candidate_id: id,
        author_id: guard.userId,
        body,
      })
      .select('*')
      .single();

    if (error || !comment) {
      console.error('hiring comment POST error:', error);
      return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
    }

    // Resolve author_name for immediate UI display
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', guard.userId)
      .maybeSingle();

    logHiringEvent({
      tenant_id: guard.tenantId,
      job_id: candidate.job_id,
      candidate_id: id,
      event_type: 'comment_added',
      actor_id: guard.userId,
      meta: { comment_id: comment.id },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          comment: {
            ...comment,
            author_name: profile?.full_name || guard.userEmail || 'Team member',
          },
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Unexpected error in hiring/candidates/[id]/comments POST:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
