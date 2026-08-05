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
import { crewTimecardSpan, groupCrewTimecards } from '@/lib/crew-timecards';
import { computeJobProgress, matchWorkItemToScope, quantityInUnit, type ScopeItemLike, type WorkItemLike } from '@/lib/job-progress';
import { getTenantTimezone } from '@/lib/tenant-timezone';
import { dateInTz } from '@/lib/reminder-timing';
import { normalizeJobArrays } from '@/lib/job-arrays';

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
        completion_signature,
        completion_signature_url,
        completion_signer_name,
        completion_signed_at,
        completion_pdf_url,
        customer_signature,
        customer_signed_at,
        customer_signature_method,
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
        photo_urls,
        ppe_required,
        additional_safety_requirements,
        customer_id,
        site_contact_phone,
        estimated_cost,
        track_financials,
        drive_distance_miles,
        mileage_rate,
        equipment_cost,
        material_cost,
        other_cost,
        subcontractor_cost,
        scope_details,
        scheduling_flexibility,
        site_compliance,
        jobsite_conditions,
        equipment_needed,
        equipment_selections,
        equipment_rental_flags,
        scope_photo_urls,
        difficulty_rating,
        additional_info,
        project_manager_id,
        in_route_at,
        arrived_at_jobsite_at,
        route_started_at,
        work_started_at,
        work_completed_at
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

    // A NULL list column must never reach the UI — it crashed two live tickets
    // on 5 Aug 2026 (see lib/job-arrays.ts).
    Object.assign(job as object, normalizeJobArrays(job as Record<string, unknown>));

    // Fetch helper profile separately (same pattern as operator above).
    // Without this the schedule-form edit-load can't repopulate the helper and a
    // re-save silently drops helper_assigned_to.
    let helperProfile: { full_name: string } | null = null;
    if ((job as any).helper_assigned_to) {
      const { data: helperProf } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', (job as any).helper_assigned_to)
        .maybeSingle();
      helperProfile = helperProf;
    }

    // ── 1b. Crew (job_crew) + per-member timecards for the job's date span ──
    // "One ticket, whole crew": the admin sees every crew member's role plus
    // their clock-in/out times per day. Timecards NOT linked to this job are
    // still returned (job_linked=false → "(day card)" label) so the office
    // sees the person's day even when the card wasn't clocked to the job.
    let crew: Array<{ user_id: string; role: string; full_name: string | null }> = [];
    let crewTimecards: ReturnType<typeof groupCrewTimecards> = [];
    try {
      const { data: crewRows } = await supabaseAdmin
        .from('job_crew')
        .select('user_id, role')
        .eq('job_order_id', jobId);

      const memberIds = new Set<string>();
      if ((job as any).assigned_to) memberIds.add((job as any).assigned_to);
      if ((job as any).helper_assigned_to) memberIds.add((job as any).helper_assigned_to);
      for (const r of crewRows || []) memberIds.add(r.user_id);

      const nameByUserId = new Map<string, string | null>();
      if (memberIds.size > 0) {
        const { data: memberProfiles } = await supabaseAdmin
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(memberIds));
        for (const p of memberProfiles || []) nameByUserId.set(p.id, p.full_name ?? null);
      }

      crew = (crewRows || []).map((r) => ({
        user_id: r.user_id,
        role: r.role,
        full_name: nameByUserId.get(r.user_id) ?? null,
      }));

      // Tenant-calendar "today" — the server runs UTC on Vercel; a bare local
      // date would extend/shrink the span around midnight (same idiom as the
      // daily-log route).
      let tenantTz = 'America/New_York';
      try {
        if (tenantId) {
          const { data: tzRow } = await supabaseAdmin
            .from('tenants')
            .select('timezone')
            .eq('id', tenantId)
            .maybeSingle();
          if (tzRow?.timezone) tenantTz = tzRow.timezone;
        }
      } catch { /* default tz */ }
      const todayTz = new Date().toLocaleDateString('en-CA', { timeZone: tenantTz });

      const span = crewTimecardSpan(
        {
          scheduled_date: (job as any).scheduled_date ?? null,
          end_date: (job as any).end_date ?? null,
          scheduled_end_date: (job as any).scheduled_end_date ?? null,
          actual_end_date: (job as any).actual_end_date ?? null,
          status: (job as any).status ?? null,
        },
        todayTz
      );
      if (span) {
        // WHO WORKED THIS JOB = the roster PLUS anyone who actually clocked
        // into it. The old query only looked at roster members, so a person who
        // clocked in against the job but was never added to the crew had their
        // hours vanish from the job entirely (founder: "Aiden was at that job,
        // it should show his clock-in to clock-out"). A timecard pointing at
        // this job is ground truth — they were there; the roster is just a plan.
        const memberList = Array.from(memberIds);
        let tcQuery = supabaseAdmin
          .from('timecards')
          .select('user_id, date, clock_in_time, clock_out_time, total_hours, job_order_id')
          .gte('date', span.from)
          .lte('date', span.to);
        tcQuery = memberList.length > 0
          ? tcQuery.or(`user_id.in.(${memberList.join(',')}),job_order_id.eq.${jobId}`)
          : tcQuery.eq('job_order_id', jobId);
        if (tenantId) tcQuery = tcQuery.eq('tenant_id', tenantId);
        const { data: tcRows } = await tcQuery.order('date', { ascending: true });

        // Resolve names for anyone who showed up via a timecard but isn't on
        // the roster — otherwise they'd render as a blank row.
        const unknownIds = Array.from(
          new Set((tcRows || []).map((r) => r.user_id).filter((id) => id && !nameByUserId.has(id)))
        );
        if (unknownIds.length > 0) {
          const { data: extraProfiles } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name')
            .in('id', unknownIds);
          for (const pr of extraProfiles || []) {
            nameByUserId.set(pr.id, pr.full_name ?? null);
          }
        }

        crewTimecards = groupCrewTimecards(tcRows || [], nameByUserId, jobId);
      }
    } catch (e) {
      // Non-critical — the rest of the summary still renders.
      console.error('[summary] crew/timecards fetch failed:', e);
    }

    // Fetch the project manager's name (project_manager_id → profiles).
    let pmProfile: { full_name: string } | null = null;
    if ((job as any).project_manager_id) {
      const { data: pmProf } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', (job as any).project_manager_id)
        .maybeSingle();
      pmProfile = pmProf;
    }

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
        core_size,
        core_depth_inches,
        linear_feet_cut,
        cut_depth_inches,
        accessibility_rating,
        accessibility_description,
        details_json,
        created_at
      `)
      .eq('job_order_id', jobId);
    if (tenantId) workItemsQuery = workItemsQuery.eq('tenant_id', tenantId);
    const { data: workItems } = await workItemsQuery.order('created_at', { ascending: false });

    // Dates an operator would recognise, not UTC dates.
    const tenantTz = await getTenantTimezone(tenantId);

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
    // The rollup used to sum `job_progress_entries`, which nothing writes — so
    // every job reported 0% while its work_items sat right here in this same
    // route, merged into by_date for DISPLAY only. Both now come from the same
    // place. See lib/job-progress.ts for the vocabulary bridge.
    const derived = computeJobProgress(
      (scopeItems ?? []) as ScopeItemLike[],
      (workItems ?? []) as WorkItemLike[]
    );
    const sortOrderById = new Map((scopeItems ?? []).map((s) => [s.id, s.sort_order]));

    let totalTarget = 0;
    let totalCompleted = 0;

    const enrichedScopeItems = derived.scope_progress.map((row) => {
      // Percent-unit targets have no reportable quantity — excluded from the
      // totals so they can't drag the overall figure toward zero.
      if (row.derivable) {
        totalTarget += row.target_quantity;
        totalCompleted += row.completed_quantity;
      }
      return {
        id: row.scope_item_id,
        work_type: row.work_type,
        description: row.description,
        unit: row.unit,
        target_quantity: row.target_quantity,
        completed_quantity: row.completed_quantity,
        pct_complete: row.pct_complete,
        derivable: row.derivable,
        entry_count: row.entry_count,
        sort_order: sortOrderById.get(row.scope_item_id) ?? 0,
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
      // Read the timestamp in the TENANT'S timezone — the server runs UTC, so
      // slicing the string files an 8pm submission under tomorrow's date.
      const dateKey = dateInTz(created, tenantTz);
      if (!dateKey) continue;
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

    // Each target's per-day contribution, from the same derived numbers as the
    // summary above so the chart and the headline can never disagree.
    const dailyByScope: Record<string, Array<{ date: string; quantity: number }>> = {};
    for (const wi of workItems || []) {
      const { scopeItem } = matchWorkItemToScope(wi as WorkItemLike, (scopeItems ?? []) as ScopeItemLike[]);
      if (!scopeItem) continue;
      const qty = quantityInUnit(wi as WorkItemLike, scopeItem.unit);
      const date = dateInTz((wi as any).created_at, tenantTz);
      if (qty === null || !date) continue;
      (dailyByScope[scopeItem.id] ||= []).push({ date, quantity: qty });
    }

    for (const row of derived.scope_progress) {
      byScopeItemMap[row.scope_item_id] = {
        scope_item_id: row.scope_item_id,
        description: row.description ?? '',
        work_type: row.work_type,
        unit: row.unit,
        target_quantity: row.target_quantity,
        total_completed: row.completed_quantity,
        pct_complete: row.pct_complete ?? 0,
        daily_entries: dailyByScope[row.scope_item_id] ?? [],
      };
    }

    // ── 7b. Full operator submissions grouped by day ───────────────────────
    // The admin job page renders these next to the ORIGINAL scope: every hole
    // size/depth, cuts/LF/wet-dry, per-item notes and the difficulty pick live
    // in details_json + the accessibility columns (not in the lossy summary).
    const workItemsByDayMap = new Map<number, any[]>();
    for (const wi of workItems || []) {
      const day = Number((wi as any).day_number) || 1;
      if (!workItemsByDayMap.has(day)) workItemsByDayMap.set(day, []);
      workItemsByDayMap.get(day)!.push({
        ...(wi as any),
        operator_name:
          workItemOperatorMap[(wi as any).operator_id] ??
          (operatorProfile?.full_name ?? null),
      });
    }
    const workItemsByDay = Array.from(workItemsByDayMap.keys())
      .sort((a, b) => a - b)
      .map((day) => ({ day_number: day, items: workItemsByDayMap.get(day)! }));

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
          helper_assigned_to: (job as any).helper_assigned_to ?? null,
          helper_name: helperProfile?.full_name ?? null,
          completion_submitted_at: job.completion_submitted_at,
          completion_requested_at: completionRequest?.submitted_at ?? job.completion_submitted_at ?? null,
          completion_request_notes: completionRequest?.operator_notes ?? null,
          completion_approved_at: null,
          completion_rejected_at: (job as any).rejected_at ?? null,
          completion_rejection_notes: (job as any).rejection_notes ?? (job as any).rejection_reason ?? null,
          commission_rate: (job as any).commission_rate ?? null,
          // Schedule-form edit-load reads these to repopulate Step 5 (PPE +
          // additional safety requirements). Without them the toggle never
          // re-expands and a re-save would wipe the stored values.
          ppe_required: Array.isArray((job as any).ppe_required) ? (job as any).ppe_required : [],
          additional_safety_requirements: Array.isArray((job as any).additional_safety_requirements)
            ? (job as any).additional_safety_requirements
            : [],
          // Schedule-form edit-load reads these to repopulate Steps 1-4 + 6 + 8.
          // Three column names differ from the form keys (customer_contact→
          // site_contact, site_contact_phone→contact_phone, location→location_name).
          // Without them the edit form showed blanks and a re-save dropped the values.
          customer_id: (job as any).customer_id ?? null,
          site_contact: (job as any).customer_contact ?? null,
          contact_phone: (job as any).site_contact_phone ?? (job as any).foreman_phone ?? null,
          location_name: (job as any).location ?? null,
          estimated_cost: (job as any).estimated_cost ?? null,
          // Optional financial-tracking fields (opt-in via track_financials).
          // Edit-load repopulates the schedule-form's collapsible section so a
          // re-save doesn't silently wipe out cost data entered previously.
          track_financials: (job as any).track_financials ?? false,
          drive_distance_miles: (job as any).drive_distance_miles ?? null,
          mileage_rate: (job as any).mileage_rate ?? null,
          equipment_cost: (job as any).equipment_cost ?? null,
          material_cost: (job as any).material_cost ?? null,
          other_cost: (job as any).other_cost ?? null,
          subcontractor_cost: (job as any).subcontractor_cost ?? null,
          scope_details: (job as any).scope_details ?? {},
          scheduling_flexibility: (job as any).scheduling_flexibility ?? {},
          site_compliance: (job as any).site_compliance ?? {},
          jobsite_conditions: (job as any).jobsite_conditions ?? {},
          equipment_needed: Array.isArray((job as any).equipment_needed) ? (job as any).equipment_needed : [],
          equipment_selections: (job as any).equipment_selections ?? {},
          // Additional fields the schedule-form edit-load reads. Without these
          // the edit form loaded blanks and a re-save WIPED the stored values
          // (scope photos, rental flags, difficulty, notes). Now they round-trip.
          equipment_rental_flags: (job as any).equipment_rental_flags ?? {},
          scope_photo_urls: Array.isArray((job as any).scope_photo_urls) ? (job as any).scope_photo_urls : [],
          difficulty_rating: (job as any).difficulty_rating ?? null,
          additional_notes: (job as any).additional_info ?? null,
          // Project manager (office owner of the job).
          project_manager_id: (job as any).project_manager_id ?? null,
          project_manager_name: pmProfile?.full_name ?? null,
          // Job-level route/on-site stamps (the LEAD drives these — the client
          // labels them as the lead's).
          in_route_at: (job as any).in_route_at ?? null,
          arrived_at_jobsite_at: (job as any).arrived_at_jobsite_at ?? null,
          route_started_at: (job as any).route_started_at ?? null,
          work_started_at: (job as any).work_started_at ?? null,
          work_completed_at: (job as any).work_completed_at ?? null,
        },
        // Crew beyond the lead/helper slots (job_crew): role 'operator' = full
        // input co-operator; role 'helper' = light work-log.
        crew,
        // Per-member clock-in/out grouped by date across the job's span.
        // job_linked=false entries are general day cards, label as "(day card)".
        crew_timecards: crewTimecards,
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
        work_items_by_day: workItemsByDay,
        // job-photos bucket is PRIVATE (security F1) but photo_urls stores
        // public-style URLs — sign them server-side or every <img> 404s.
        photos: await (async () => {
          const { signStoredUrls } = await import('@/lib/storage-url-server');
          return signStoredUrls(Array.isArray((job as any).photo_urls) ? (job as any).photo_urls : []);
        })(),
        is_last_day: isLastDay,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
