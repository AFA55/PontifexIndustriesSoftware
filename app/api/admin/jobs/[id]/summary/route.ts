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
    let jobQuery = supabaseAdmin
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
        utility_waiver_signed_at,
        commission_rate,
        photo_urls
      `)
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await jobQuery.single();

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
    let scopeQuery = supabaseAdmin
      .from('job_scope_items')
      .select('id, work_type, description, unit, target_quantity, sort_order')
      .eq('job_order_id', jobId);
    if (tenantId) scopeQuery = scopeQuery.eq('tenant_id', tenantId);
    const { data: scopeItems } = await scopeQuery.order('sort_order', { ascending: true });

    // ── 3. Fetch all progress entries ───────────────────────────────────────
    let progressQuery = supabaseAdmin
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
      .eq('job_order_id', jobId);
    if (tenantId) progressQuery = progressQuery.eq('tenant_id', tenantId);
    const { data: progressEntries } = await progressQuery.order('date', { ascending: false });

    // ── 3b. Fetch operator-submitted work_items (bridges Work Performed flow) ─
    // Operators POST to /api/job-orders/[id]/work-items which writes to the
    // `work_items` table — separate from `job_progress_entries`. We merge them
    // into progress.by_date so admins can see them in the Job Scope & Progress
    // panel. Scope rollup math stays based on job_progress_entries only because
    // work_items have no scope_item_id linkage.
    let workItemsQuery = supabaseAdmin
      .from('work_items')
      .select(`
        id,
        operator_id,
        work_type,
        quantity,
        notes,
        day_number,
        core_quantity,
        linear_feet_cut,
        details_json,
        created_at
      `)
      .eq('job_order_id', jobId);
    if (tenantId) workItemsQuery = workItemsQuery.eq('tenant_id', tenantId);
    const { data: workItems } = await workItemsQuery.order('created_at', { ascending: false });

    // Resolve operator names for any work_items.operator_id values not already
    // present in the progressEntries operator profile join.
    const workItemOperatorIds = Array.from(
      new Set((workItems || []).map((wi: any) => wi.operator_id).filter(Boolean))
    );
    const workItemOperatorMap: Record<string, string> = {};
    if (workItemOperatorIds.length > 0) {
      const { data: opProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', workItemOperatorIds);
      for (const p of opProfiles || []) {
        workItemOperatorMap[(p as any).id] = (p as any).full_name;
      }
    }

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
      let crQuery = supabaseAdmin
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
        .eq('job_order_id', jobId);
      if (tenantId) crQuery = crQuery.eq('tenant_id', tenantId);
      const { data: crData } = await crQuery
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

    // Merge operator-submitted work_items into byDate. work_items have no
    // explicit `date` column, so we derive the YYYY-MM-DD date key from
    // created_at. They have no scope_item_id, so we surface the work_type as
    // both the description and work_type, and infer a unit hint from the
    // detail fields when present (cores / LF).
    for (const wi of workItems || []) {
      const created = (wi as any).created_at;
      if (!created) continue;
      const dateKey =
        typeof created === 'string'
          ? created.slice(0, 10)
          : new Date(created).toISOString().slice(0, 10);
      if (!byDate[dateKey]) byDate[dateKey] = [];

      const workType = (wi as any).work_type ?? null;
      let unit: string | null = null;
      let quantity = Number((wi as any).quantity ?? 0);
      if ((wi as any).core_quantity != null && Number((wi as any).core_quantity) > 0) {
        unit = 'cores';
        quantity = Number((wi as any).core_quantity);
      } else if ((wi as any).linear_feet_cut != null && Number((wi as any).linear_feet_cut) > 0) {
        unit = 'LF';
        quantity = Number((wi as any).linear_feet_cut);
      }

      byDate[dateKey].push({
        id: (wi as any).id,
        scope_item_id: null,
        scope_item_description: workType ?? 'Operator-submitted work',
        work_type: workType,
        unit,
        quantity_completed: quantity,
        operator_name:
          workItemOperatorMap[(wi as any).operator_id] ??
          (operatorProfile?.full_name ?? 'Unknown'),
        notes: (wi as any).notes ?? null,
        source: 'work_items',
        day_number: (wi as any).day_number ?? null,
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
          commission_rate: (job as any).commission_rate ?? null,
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
        photos: Array.isArray((job as any).photo_urls) ? (job as any).photo_urls : [],
        is_last_day: isLastDay,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
