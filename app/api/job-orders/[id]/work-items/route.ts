export const dynamic = 'force-dynamic';

/**
 * API Route: /api/job-orders/[id]/work-items
 * Save and retrieve work performed items for a job
 *
 * POST - Save work items to the database (replaces localStorage)
 * GET - Retrieve all work items for a job
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { buildWorkPerformedSummary, difficultyToRating } from '@/lib/work-items-format';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await params;
    const body = await request.json();
    // `notes` = the job-level typed/voice day note; `difficulty` +
    // `difficultyNotes` = the per-submission difficulty pick. `workDate` =
    // the operator's local YYYY-MM-DD (anchors the day-note daily_job_logs row).
    const { items, dayNumber, notes: dayNote, difficulty, difficultyNotes, workDate } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'At least one work item is required' },
        { status: 400 }
      );
    }

    // Verify job exists (tenant-scoped to prevent cross-tenant write)
    const callerTenantId = await getTenantId(auth.userId);
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, assigned_to, helper_assigned_to, status, tenant_id')
      .eq('id', jobId);
    if (callerTenantId) jobQuery = jobQuery.eq('tenant_id', callerTenantId);
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Verify user is assigned to this job (operator or helper) or is admin
    let isAssigned = job.assigned_to === auth.userId || job.helper_assigned_to === auth.userId;
    const isAdmin = ['admin', 'super_admin', 'operations_manager'].includes(auth.role);

    // Crew members (job_crew, any role) also submit work — co-operators the
    // full flow, helpers via their work-log. The job row above is already
    // tenant-scoped, so this membership check inherits the tenant boundary.
    if (!isAssigned && !isAdmin) {
      const { data: crewRow } = await supabaseAdmin
        .from('job_crew')
        .select('id')
        .eq('job_order_id', jobId)
        .eq('user_id', auth.userId)
        .limit(1)
        .maybeSingle();
      isAssigned = !!crewRow;
    }

    if (!isAssigned && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized for this job' }, { status: 403 });
    }

    // Delete existing work items for this job + day (replace pattern) — ONLY
    // this submitter's rows. Without the operator filter, one crew member's
    // resubmit wiped every other crew member's items for the day.
    const effectiveDay = dayNumber || 1;
    await supabaseAdmin
      .from('work_items')
      .delete()
      .eq('job_order_id', jobId)
      .eq('day_number', effectiveDay)
      .eq('operator_id', auth.userId);

    // Per-submission difficulty → the 1–5 accessibility columns (same label
    // map the daily-log route uses). Applied to every row of this submission.
    const submissionRating = difficultyToRating(difficulty);
    const submissionDifficultyNote =
      typeof difficultyNotes === 'string' && difficultyNotes.trim()
        ? difficultyNotes.trim()
        : null;

    // Map frontend work items to database rows
    const workItemRows = items.map((item: any) => {
      const row: any = {
        job_order_id: jobId,
        operator_id: auth.userId,
        // tenant_id has NO auto-set trigger — without stamping it here, every
        // tenant-scoped admin read (summary, completion-summary) silently
        // drops these rows.
        tenant_id: job.tenant_id ?? callerTenantId ?? null,
        work_type: item.name,
        quantity: item.quantity || 1,
        notes: item.notes || null,
        day_number: effectiveDay,
        details_json: null,
        accessibility_rating: submissionRating,
        accessibility_description: submissionDifficultyNote,
      };

      // Extract specific fields from details based on work type
      if (item.details) {
        row.details_json = item.details;

        // Core drilling specifics
        if (item.details.holes && item.details.holes.length > 0) {
          const firstHole = item.details.holes[0];
          row.core_size = firstHole.bitSize || null;
          row.core_depth_inches = firstHole.depthInches || null;
          row.core_quantity = item.details.holes.reduce((sum: number, h: any) => sum + (h.quantity || 1), 0);
        }

        // Sawing specifics
        if (item.details.cuts && item.details.cuts.length > 0) {
          row.linear_feet_cut = item.details.cuts.reduce((sum: number, c: any) => sum + (c.linearFeet || 0), 0);
          row.cut_depth_inches = item.details.cuts[0].cutDepth || null;
        }
      }

      return row;
    });

    // Insert all work items
    const { data: savedItems, error: insertError } = await supabaseAdmin
      .from('work_items')
      .insert(workItemRows)
      .select();

    if (insertError) {
      console.error('Error saving work items:', insertError);
      return NextResponse.json(
        { error: 'Failed to save work items' },
        { status: 500 }
      );
    }

    // Build a comprehensive work_performed summary from ALL days (not just today)
    // — prevents multi-day jobs from losing previous days' summaries. The
    // builder expands details_json (all hole sizes/depths, LF, wet/dry, notes)
    // instead of the old lossy "Core Drilling x1". Feeds invoices + portal.
    const { data: allWorkItems } = await supabaseAdmin
      .from('work_items')
      .select('work_type, quantity, core_quantity, core_size, core_depth_inches, linear_feet_cut, cut_depth_inches, notes, details_json, day_number')
      .eq('job_order_id', jobId)
      .order('day_number', { ascending: true });

    const workSummary = buildWorkPerformedSummary(allWorkItems || []);

    {
      let summaryUpdate = supabaseAdmin
        .from('job_orders')
        .update({ work_performed: workSummary })
        .eq('id', jobId);
      if (callerTenantId) summaryUpdate = summaryUpdate.eq('tenant_id', callerTenantId);
      await summaryUpdate;
    }

    // ── Persist the job-level day note (was silently dropped before) ─────────
    // Stored on the operator's daily_job_logs row for today so it lives next
    // to the day's work. Upsert touches ONLY `notes`; the day-complete flow
    // later MERGES its own note onto this instead of overwriting (see
    // /api/job-orders/[id]/daily-log). A resubmit from this page replaces the
    // page's own previous note — intended.
    if (typeof dayNote === 'string' && dayNote.trim()) {
      let logDate =
        typeof workDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(workDate) ? workDate : null;
      if (!logDate) {
        // Fall back to the tenant-local calendar date (never toISOString —
        // that's the recurring UTC-off-by-a-day bug).
        const { data: tenantRow } = job.tenant_id
          ? await supabaseAdmin.from('tenants').select('timezone').eq('id', job.tenant_id).maybeSingle()
          : { data: null };
        const tz = (tenantRow as { timezone: string | null } | null)?.timezone || 'America/New_York';
        logDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
      }
      await supabaseAdmin
        .from('daily_job_logs')
        .upsert(
          {
            job_order_id: jobId,
            operator_id: auth.userId,
            log_date: logDate,
            notes: dayNote.trim(),
            // Stamp tenant_id: no trigger sets it, and tenant-filtered admin
            // reads (completion-summary) silently drop unstamped rows.
            tenant_id: job.tenant_id ?? callerTenantId ?? null,
          },
          { onConflict: 'job_order_id,operator_id,log_date' }
        )
        .then(({ error }) => {
          if (error) console.error('Error saving day note to daily_job_logs:', error);
        });
    }

    // ── Notify tenant admins (fire-and-forget) ────────────────────────────────
    // Operator just logged work performed — admins should see this in real time.
    Promise.resolve((async () => {
      try {
        // Pull the tenant + job_number off the job (already loaded `job` lacks them).
        const { data: jobMeta } = await supabaseAdmin
          .from('job_orders')
          .select('tenant_id, job_number')
          .eq('id', jobId)
          .maybeSingle();

        const tenantId = jobMeta?.tenant_id ?? null;
        const jobNumber = jobMeta?.job_number ?? jobId;

        if (!tenantId) return; // Nothing safe to scope notifications to.

        // Operator name for the message body.
        const { data: operatorProfile } = await supabaseAdmin
          .from('profiles')
          .select('full_name')
          .eq('id', auth.userId)
          .maybeSingle();
        const operatorName = operatorProfile?.full_name || 'An operator';

        // Build a concise summary: total count + first item description.
        const totalCount = items.reduce(
          (sum: number, it: any) => sum + (Number(it.quantity) || 1),
          0
        );
        const firstName = items[0]?.name ? String(items[0].name) : 'work';
        const moreCount = items.length > 1 ? ` (+${items.length - 1} more)` : '';
        const message = `${operatorName} logged ${totalCount} ${firstName}${moreCount} on ${jobNumber}`;

        // Find admins in this tenant.
        const { data: admins } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .in('role', ['admin', 'super_admin', 'operations_manager'])
          .eq('tenant_id', tenantId);

        if (!admins || admins.length === 0) return;

        const notifications = admins.map((a: { id: string }) => ({
          user_id: a.id,
          type: 'work_performed',
          title: 'Work performed update',
          message,
          job_id: jobId,
          tenant_id: tenantId,
          sender_id: auth.userId,
          related_entity_type: 'job_order',
          related_entity_id: jobId,
          action_url: `/dashboard/admin/jobs/${jobId}`,
          read: false,
          is_read: false,
        }));

        await supabaseAdmin.from('notifications').insert(notifications);
      } catch {
        // Non-critical — never block the operator's submit response.
      }
    })()).catch(() => {});

    return NextResponse.json({
      success: true,
      data: savedItems,
      message: `${savedItems.length} work items saved`
    });

  } catch (error: any) {
    console.error('Error in work-items POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await params;

    const { data: items, error } = await supabaseAdmin
      .from('work_items')
      .select('*')
      .eq('job_order_id', jobId)
      .order('day_number', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching work items:', error);
      return NextResponse.json(
        { error: 'Failed to fetch work items' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: items || []
    });

  } catch (error: any) {
    console.error('Error in work-items GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
