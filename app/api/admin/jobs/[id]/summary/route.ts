export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/jobs/[id]/summary
 * Full job summary for admin view: job info, scope, progress, completion request.
 *
 * GET — requireAdmin
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    // ── 1. Fetch the job ────────────────────────────────────────────────────
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select(`
        id,
        job_number,
        status,
        scheduled_date,
        scheduled_end_date,
        end_date,
        actual_end_date,
        customer_name,
        customer_contact,
        customer_email,
        job_type,
        location,
        address,
        description,
        arrival_time,
        is_will_call,
        po_number,
        permit_required,
        permits,
        completion_notes,
        completion_submitted_at,
        rejection_reason,
        rejection_notes,
        rejected_at,
        assigned_to,
        helper_assigned_to,
        foreman_name,
        foreman_phone,
        project_name,
        require_waiver_signature,
        utility_waiver_signed,
        utility_waiver_signer_name,
        utility_waiver_signed_at
      `)
      .eq('id', jobId)
      .eq('tenant_id', tenantId)
      .single();

    if (jobError || !job) {
      console.error('[summary] job fetch failed', { jobId, tenantId, jobError });
      return NextResponse.json({ error: 'Job not found', debug: jobError?.message }, { status: 404 });
    }

    // Fetch operator profile separately (assigned_to → auth.users, not profiles)
    let operatorProfile: { full_name: string } | null = null;
    if ((job as any).assigned_to) {
      const { data: opProf } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', (job as any).assigned_to)
        .maybeSingle();
      operatorProfile = opProf;
    }
    (job as any).profiles = operatorProfile;

    // ── 2. Fetch scope items ────────────────────────────────────────────────
    const { data: scopeItems } = await supabaseAdmin
      .from('job_scope_items')
      .select('id, work_type, description, unit, target_quantity, sort_order')
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });

    // ── 3. Fetch all progress entries ───────────────────────────────────────
    const { data: progressEntries } = await supabaseAdmin
      .from('job_progress_entries')
      .select(`
        id,
        scope_item_id,
        quantity_completed,
        date,
        notes,
        work_type,
        operator_id,
        profiles!job_progress_entries_operator_id_fkey(full_name),
        job_scope_items!job_progress_entries_scope_item_id_fkey(description, work_type, unit)
      `)
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false });

    // ── 4. Fetch the latest completion request ──────────────────────────────
    let completionRequest: {
      id: string;
      status: string;
      operator_notes: string | null;
      submitted_at: string;
      review_notes: string | null;
      submitted_by: string;
      profiles: { full_name: string } | { full_name: string }[] | null;
    } | null = null;
    try {
      const { data: crData } = await supabaseAdmin
        .from('job_completion_requests')
        .select(`
          id,
          status,
          operator_notes,
          submitted_at,
          review_notes,
          submitted_by,
          profiles!job_completion_requests_submitted_by_fkey(full_name)
        `)
        .eq('job_order_id', jobId)
        .eq('tenant_id', tenantId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .single();
      completionRequest = crData ?? null;
    } catch {
      completionRequest = null;
    }

    // ── 5. Build scope summary ──────────────────────────────────────────────
    const completedByScopeItem: Record<string, number> = {};
    for (const entry of progressEntries || []) {
      if (entry.scope_item_id) {
        completedByScopeItem[entry.scope_item_id] =
          (completedByScopeItem[entry.scope_item_id] || 0) + Number(entry.quantity_completed);
      }
    }

    let totalTarget = 0;
    let totalCompleted = 0;

    const enrichedScopeItems = (scopeItems || []).map((item) => {
      const completed = completedByScopeItem[item.id] || 0;
      const target = Number(item.target_quantity);
      const pct = target > 0 ? parseFloat(Math.min(100, (completed / target) * 100).toFixed(1)) : 0;
      totalTarget += target;
      totalCompleted += completed;
      return {
        id: item.id,
        work_type: item.work_type,
        description: item.description,
        unit: item.unit,
        target_quantity: target,
        completed_quantity: completed,
        pct_complete: pct,
        sort_order: item.sort_order,
      };
    });

    const overallPct =
      totalTarget > 0
        ? parseFloat(Math.min(100, (totalCompleted / totalTarget) * 100).toFixed(1))
        : 0;

    // ── 6. Build progress by_date ───────────────────────────────────────────
    const byDate: Record<string, any[]> = {};
    for (const entry of progressEntries || []) {
      const dateKey = entry.date;
      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push({
        id: entry.id,
        scope_item_id: entry.scope_item_id,
        scope_item_description: (entry.job_scope_items as any)?.description ?? null,
        work_type: (entry.job_scope_items as any)?.work_type ?? entry.work_type ?? null,
        unit: (entry.job_scope_items as any)?.unit ?? null,
        quantity_completed: Number(entry.quantity_completed),
        operator_name: (entry.profiles as any)?.full_name ?? 'Unknown',
        notes: entry.notes ?? null,
      });
    }

    const progressByDate = Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, entries]) => ({ date, entries }));

    // ── 7. Build progress by_scope_item ────────────────────────────────────
    const byScopeItemMap: Record<string, {
      scope_item_id: string;
      description: string;
      work_type: string;
      unit: string;
      target_quantity: number;
      total_completed: number;
      pct_complete: number;
      daily_entries: Array<{ date: string; quantity: number }>;
    }> = {};

    for (const item of scopeItems || []) {
      byScopeItemMap[item.id] = {
        scope_item_id: item.id,
        description: item.description ?? '',
        work_type: item.work_type,
        unit: item.unit,
        target_quantity: Number(item.target_quantity),
        total_completed: completedByScopeItem[item.id] || 0,
        pct_complete:
          Number(item.target_quantity) > 0
            ? parseFloat(
                Math.min(
                  100,
                  ((completedByScopeItem[item.id] || 0) / Number(item.target_quantity)) * 100
                ).toFixed(1)
              )
            : 0,
        daily_entries: (progressEntries || [])
          .filter((e) => e.scope_item_id === item.id)
          .map((e) => ({ date: e.date, quantity: Number(e.quantity_completed) })),
      };
    }

    // ── 8. Determine is_last_day ────────────────────────────────────────────
    const todayStr = new Date().toISOString().split('T')[0];
    const isLastDay =
      job.scheduled_end_date === todayStr ||
      (!job.scheduled_end_date && job.scheduled_date === todayStr);

    return NextResponse.json({
      success: true,
      data: {
        job: {
          id: job.id,
          job_number: job.job_number,
          status: job.status,
          scheduled_date: job.scheduled_date,
          scheduled_end_date: job.scheduled_end_date,
          end_date: (job as any).end_date ?? (job as any).scheduled_end_date ?? null,
          actual_end_date: job.actual_end_date,
          customer_name: job.customer_name,
          customer_phone: (job as any).foreman_phone ?? null,
          customer_email: (job as any).customer_email ?? null,
          contact_name: (job as any).customer_contact ?? (job as any).foreman_name ?? null,
          job_type: (job as any).job_type ?? null,
          location: (job as any).location ?? null,
          address: (job as any).address ?? null,
          description: (job as any).description ?? null,
          scope_of_work: (job as any).description ?? null,
          arrival_time: (job as any).arrival_time ?? null,
          is_will_call: (job as any).is_will_call ?? false,
          po_number: (job as any).po_number ?? null,
          permit_number: Array.isArray((job as any).permits)
            ? ((job as any).permits[0]?.number ?? null)
            : null,
          permit_required: (job as any).permit_required ?? false,
          notes: (job as any).completion_notes ?? null,
          internal_notes: null,
          project_name: (job as any).project_name ?? null,
          assigned_to: job.assigned_to ?? null,
          operator_name: ((job as any).profiles as any)?.full_name ?? null,
          helper_name: null,
          completion_submitted_at: job.completion_submitted_at,
          completion_requested_at: completionRequest?.submitted_at ?? job.completion_submitted_at ?? null,
          completion_request_notes: completionRequest?.operator_notes ?? null,
          completion_approved_at: null,
          completion_rejected_at: (job as any).rejected_at ?? null,
          completion_rejection_notes: (job as any).rejection_notes ?? (job as any).rejection_reason ?? null,
        },
        scope: {
          items: enrichedScopeItems,
          overall_pct: overallPct,
          total_target: totalTarget,
          total_completed: totalCompleted,
        },
        progress: {
          by_date: progressByDate,
          by_scope_item: Object.values(byScopeItemMap),
        },
        completion_request: completionRequest
          ? {
              id: completionRequest.id,
              status: completionRequest.status,
              submitted_by_name: (completionRequest.profiles as any)?.full_name ?? null,
              submitted_at: completionRequest.submitted_at,
              operator_notes: completionRequest.operator_notes,
              review_notes: completionRequest.review_notes,
            }
          : null,
        is_last_day: isLastDay,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
