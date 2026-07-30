export const dynamic = 'force-dynamic';

/**
 * Crew management for a job — additional operators beyond the LEAD (assigned_to).
 * These are stored in job_crew with role='helper' and get the light helper-ticket
 * flow. One full completion (the lead) + N short descriptions (the crew).
 *
 * GET    — list crew members (user_id, role, full_name)
 * POST   — add a crew member { user_id } (role helper); tenant-checked
 * DELETE — remove a crew member (?userId=)
 *
 * Management only (requireScheduleBoardAccess); tenant-scoped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

async function loadJob(jobId: string, tenantId: string | null) {
  let q = supabaseAdmin.from('job_orders').select('id, tenant_id, assigned_to, helper_assigned_to').eq('id', jobId);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data } = await q.maybeSingle();
  return data;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;
    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    if (!tenantId && auth.role !== 'super_admin') {
      return NextResponse.json({ error: 'Tenant scope required.' }, { status: 400 });
    }

    // Confirm the job belongs to the caller's tenant before returning its crew —
    // supabaseAdmin bypasses RLS, so this app-guard is the tenant boundary.
    const job = await loadJob(jobId, tenantId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const { data: rows } = await supabaseAdmin
      .from('job_crew')
      .select('user_id, role')
      .eq('job_order_id', jobId);

    const ids = (rows || []).map((r) => r.user_id);
    const nameMap = new Map<string, string | null>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from('profiles').select('id, full_name').in('id', ids);
      for (const p of profs || []) nameMap.set(p.id, p.full_name);
    }

    const crew = (rows || []).map((r) => ({
      user_id: r.user_id,
      role: r.role,
      full_name: nameMap.get(r.user_id) || null,
    }));
    return NextResponse.json({ success: true, data: crew });
  } catch (error) {
    console.error('Error in GET /crew:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;
    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required.' }, { status: 400 });

    const body = await request.json();
    const userId = body.user_id;
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const job = await loadJob(jobId, tenantId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    // The lead (assigned_to) is not a crew helper.
    if (job.assigned_to === userId) {
      return NextResponse.json({ error: 'That operator is already the lead on this job.' }, { status: 400 });
    }

    // The added user must belong to the same tenant (no cross-tenant crewing).
    const { data: addUser } = await supabaseAdmin
      .from('profiles')
      .select('id, tenant_id, full_name')
      .eq('id', userId)
      .maybeSingle();
    if (!addUser || addUser.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'That user is not in your company.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('job_crew')
      .upsert(
        { tenant_id: tenantId, job_order_id: jobId, user_id: userId, role: 'helper', added_by: auth.userId },
        { onConflict: 'job_order_id,user_id' },
      );
    if (error) {
      console.error('Error adding crew member:', error);
      return NextResponse.json({ error: 'Failed to add crew member' }, { status: 500 });
    }

    // Notify the added operator they've been crewed (best-effort, in-app).
    // Mirrors the schedule-board assign route (schedule_notifications.recipient_id).
    Promise.resolve(
      supabaseAdmin.from('schedule_notifications').insert({
        recipient_id: userId,
        job_order_id: jobId,
        type: 'job_assigned',
        title: 'Added to a job as crew',
        message: 'You were added to a job. Open My Jobs to log your work.',
        metadata: { job_order_id: jobId, is_helper: true, role: 'helper' },
      }),
    ).catch(() => {});

    return NextResponse.json({ success: true, data: { user_id: userId, full_name: addUser.full_name, role: 'helper' } });
  } catch (error) {
    console.error('Error in POST /crew:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;
    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required.' }, { status: 400 });

    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId query param is required' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('job_crew')
      .delete()
      .eq('job_order_id', jobId)
      .eq('user_id', userId)
      .eq('tenant_id', tenantId);
    if (error) {
      console.error('Error removing crew member:', error);
      return NextResponse.json({ error: 'Failed to remove crew member' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { removed: userId } });
  } catch (error) {
    console.error('Error in DELETE /crew:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
