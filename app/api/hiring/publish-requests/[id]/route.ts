export const dynamic = 'force-dynamic';

/**
 * API Route: /api/hiring/publish-requests/[id]
 *  PATCH — review a publish request: { action: 'approve' | 'reject' | 'mark_published', note? }.
 *    approve        pending  → approved   (green light to run the ad; Phase 1 = manual
 *                                          Ads Manager launch, Phase 2 = Meta/TikTok API —
 *                                          same button, different backend)
 *    reject         pending  → rejected   (note REQUIRED — shown to the customer; ALSO
 *                                          pauses the job so a rejected ad isn't 'active',
 *                                          and bell-notifies the tenant's hiring admins)
 *    mark_published approved → published  (founder clicks after actually launching the ad)
 *
 * Auth: requireSuperAdmin. Every transition logs a hiring_events row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/api-auth';
import { logHiringEvent } from '@/lib/hiring/api-guard';
import { HIRING_ADMIN_ROLES } from '@/lib/hiring/types';

const ACTIONS = ['approve', 'reject', 'mark_published'] as const;
type ReviewAction = (typeof ACTIONS)[number];

/** action → { from (required current status), to } */
const TRANSITIONS: Record<ReviewAction, { from: string; to: string }> = {
  approve: { from: 'pending', to: 'approved' },
  reject: { from: 'pending', to: 'rejected' },
  mark_published: { from: 'approved', to: 'published' },
};

const EVENT_TYPES: Record<ReviewAction, string> = {
  approve: 'publish_approved',
  reject: 'publish_rejected',
  mark_published: 'publish_marked_published',
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action as ReviewAction;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${ACTIONS.join(', ')}` },
      { status: 400 }
    );
  }

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (action === 'reject' && !note) {
    return NextResponse.json(
      { error: 'A note is required when rejecting — it is shown to the customer.' },
      { status: 400 }
    );
  }

  try {
    const { data: existing } = await supabaseAdmin
      .from('hiring_publish_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Publish request not found' }, { status: 404 });
    }

    const transition = TRANSITIONS[action];
    if (existing.status !== transition.from) {
      return NextResponse.json(
        { error: `Cannot ${action.replace('_', ' ')} a request that is '${existing.status}' (must be '${transition.from}').` },
        { status: 409 }
      );
    }

    // Status-guarded update — a concurrent reviewer loses gracefully (0 rows).
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('hiring_publish_requests')
      .update({
        status: transition.to,
        reviewed_by: auth.userId,
        reviewed_at: new Date().toISOString(),
        review_note: note || existing.review_note,
      })
      .eq('id', id)
      .eq('status', transition.from)
      .select('*')
      .maybeSingle();

    if (updateError || !updated) {
      console.error('hiring/publish-requests/[id] PATCH error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update publish request (it may have just been reviewed).' },
        { status: 409 }
      );
    }

    // Rejection also pauses the job — a rejected ad must not stay 'active'.
    if (action === 'reject') {
      const { error: pauseError } = await supabaseAdmin
        .from('hiring_jobs')
        .update({ status: 'paused' })
        .eq('id', updated.job_id)
        .eq('tenant_id', updated.tenant_id)
        .eq('status', 'active');
      if (pauseError) console.error('publish reject: failed to pause job', pauseError);
    }

    logHiringEvent({
      tenant_id: updated.tenant_id,
      job_id: updated.job_id,
      event_type: EVENT_TYPES[action],
      actor_id: auth.userId,
      meta: {
        publish_request_id: updated.id,
        ...(note ? { note } : {}),
        ...(action === 'reject' ? { job_paused: true } : {}),
      },
    });

    // Rejection → fire-and-forget bell notification to the tenant's hiring
    // admins with the review note (same pattern as the apply route).
    if (action === 'reject') {
      Promise.resolve(
        (async () => {
          const [{ data: admins }, { data: job }] = await Promise.all([
            supabaseAdmin
              .from('profiles')
              .select('id')
              .eq('tenant_id', updated.tenant_id)
              .in('role', HIRING_ADMIN_ROLES),
            supabaseAdmin
              .from('hiring_jobs')
              .select('title')
              .eq('id', updated.job_id)
              .maybeSingle(),
          ]);
          if (!admins || admins.length === 0) return;
          const jobTitle = job?.title || 'your job';
          const rows = admins.map((p: { id: string }) => ({
            user_id: p.id,
            type: 'hiring_publish_rejected',
            notification_type: 'general',
            title: 'Ad not approved',
            message: `The ad for "${jobTitle}" wasn't approved: ${note}`,
            tenant_id: updated.tenant_id,
            read: false,
            is_read: false,
            action_url: `/dashboard/hiring/jobs/${updated.job_id}`,
            metadata: {
              publish_request_id: updated.id,
              job_id: updated.job_id,
              review_note: note,
            },
          }));
          await supabaseAdmin.from('notifications').insert(rows);
        })()
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, data: { request: updated } });
  } catch (err) {
    console.error('Unexpected error in hiring/publish-requests/[id] PATCH:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
