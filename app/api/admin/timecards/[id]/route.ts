export const dynamic = 'force-dynamic';

/**
 * GET    /api/admin/timecards/[id] — fetch a specific timecard with full detail
 * PATCH  /api/admin/timecards/[id] — admin-correct clock-in/out times or add notes
 * DELETE /api/admin/timecards/[id] — archive + remove ONE entry (payroll-grade)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, isTableNotFoundError } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { recomputeLateForEdit } from '@/lib/timecard-start';
import { canDeleteTimecard, normalizeDeleteReason } from '@/lib/timecard-delete';
import { boundedJobHours } from '@/lib/labor-cost';
import { logAuditEvent } from '@/lib/audit';
import { sendNotification } from '@/lib/send-reminder';
import { formatDay } from '@/lib/dates';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: timecardId } = await params;
    const tenantId = auth.tenantId;
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    // Fetch the timecard
    let query = supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('id', timecardId);
    query = query.eq('tenant_id', tenantId);

    const { data: timecard, error: fetchError } = await query.single();

    if (fetchError) {
      if (isTableNotFoundError(fetchError)) {
        return NextResponse.json({ error: 'Timecard system not available' }, { status: 503 });
      }
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Timecard not found' }, { status: 404 });
      }
      console.error('Error fetching timecard:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch timecard' }, { status: 500 });
    }

    // Get user profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email, role, phone')
      .eq('id', timecard.user_id)
      .single();

    // Get GPS logs for this timecard (fire separate query, may not exist)
    let gpsLogs: any[] = [];
    try {
      const { data: logs } = await supabaseAdmin
        .from('timecard_gps_logs')
        .select('*')
        .eq('timecard_id', timecardId)
        .order('recorded_at', { ascending: true });
      gpsLogs = logs || [];
    } catch {
      // Table may not exist
    }

    // Get approver name if approved
    let approverName: string | null = null;
    if (timecard.approved_by) {
      const { data: approver } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', timecard.approved_by)
        .single();
      approverName = approver?.full_name || null;
    }

    // Get editor name if edited
    let editorName: string | null = null;
    if (timecard.edited_by) {
      const { data: editor } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', timecard.edited_by)
        .single();
      editorName = editor?.full_name || null;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...timecard,
        operator: {
          fullName: profile?.full_name || null,
          email: profile?.email || null,
          role: profile?.role || null,
          phone: profile?.phone || null,
        },
        approverName,
        editorName,
        gpsLogs,
        segments: timecard.segments || [],
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /api/admin/timecards/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/timecards/[id]
 * Admin-correct clock-in/out times, add notes, and recalculate total_hours.
 * Clearing late flags when clock-in is corrected backward.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: timecardId } = await params;
    const tenantId = await getTenantId(auth.userId);

    const body = await request.json();
    const { clock_in_time, clock_out_time, admin_notes } = body;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (admin_notes !== undefined) updates.admin_notes = admin_notes;
    if (clock_in_time) updates.clock_in_time = clock_in_time;
    if (clock_out_time) updates.clock_out_time = clock_out_time;

    // Fetch existing record so we can recalculate hours and check late status
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('timecards')
      .select('user_id, clock_in_time, clock_out_time, break_minutes, is_late, scheduled_start_time, date, is_shop_hours')
      .eq('id', timecardId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Timecard not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch timecard' }, { status: 500 });
    }

    // Recalculate total_hours when either time changes
    const inTime = clock_in_time
      ? new Date(clock_in_time)
      : new Date(existing.clock_in_time);
    const outTimeRaw = clock_out_time
      ? new Date(clock_out_time)
      : existing.clock_out_time
        ? new Date(existing.clock_out_time)
        : null;

    if (outTimeRaw) {
      const rawHours = (outTimeRaw.getTime() - inTime.getTime()) / 3600000;
      const breakHours = (existing.break_minutes || 0) / 60;
      updates.total_hours = Math.max(0, rawHours - breakHours);
    }

    // Recompute the late flag whenever the clock-in time is corrected. Do NOT blindly
    // clear it — a correction to a still-late time must stay flagged (founder bug:
    // "I edited their time but it still says late" — and its inverse). Late =
    // clock-in STRICTLY more than the configurable grace past the resolved start,
    // computed in the tenant's tz using the timecard's OWN date. Notification-free.
    if (clock_in_time) {
      try {
        const { data: operator } = await supabaseAdmin
          .from('profiles')
          .select('role')
          .eq('id', existing.user_id)
          .maybeSingle();
        const late = await recomputeLateForEdit({
          supabaseAdmin,
          tenantId: tenantId || '',
          operatorId: existing.user_id,
          role: operator?.role ?? null,
          clockInIso: new Date(clock_in_time).toISOString(),
          localDate: existing.date,
          isShopHours: existing.is_shop_hours === true,
        });
        updates.is_late = late.is_late;
        updates.late_minutes = late.late_minutes;
        updates.scheduled_start_time = late.scheduled_start_time;
        updates.late_source = late.late_source;
      } catch {
        // Late recompute is non-critical; never block the correction.
      }
    }

    const { data, error: updateError } = await supabaseAdmin
      .from('timecards')
      .update(updates)
      .eq('id', timecardId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating timecard:', updateError);
      return NextResponse.json({ error: 'Failed to update timecard' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error('Unexpected error in PATCH /api/admin/timecards/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Recompute every daily job log this person had on this date, from the cards
 * that REMAIN after a delete.
 *
 * `daily_job_logs.hours_worked` is derived from timecards (POST
 * /api/job-orders/[id]/daily-log sums `boundedJobHours` over ALL of the day's
 * cards), and `job_orders.total_hours_worked` is in turn the sum of that job's
 * daily logs. Deleting a card therefore leaves both stale — a job would keep
 * showing hours from an entry the office removed. We mirror the daily-log
 * route's math exactly so the two can never disagree.
 *
 * When NO cards remain for the day we write 0 rather than falling through to
 * the daily-log route's wall-clock fallback: that fallback exists for a day
 * whose timecard hasn't been written YET, and applying it here would INVENT
 * hours for a day the office just emptied. Same reasoning as that route's
 * `isBackfill` branch — admins reconcile from the timecard side.
 *
 * The delete itself is already committed by the time this runs, so a failure
 * here must NOT fail the request. But it must never be reported as success
 * either: "nothing needed recomputing" and "the recompute broke" have opposite
 * meanings for a paycheck, and the failure mode is a `daily_job_logs` row still
 * carrying the deleted card's hours — a job billed for work that didn't happen,
 * invisible to everyone. Hence `ok` + an explicit `failed[]` trail, which the
 * caller puts in the audit row AND returns to the admin so they can re-check
 * the job. Every DB call below is error-checked for that reason.
 */
interface RecomputeResult {
  /** False if ANY step failed. Distinct from "attempted 0". */
  ok: boolean;
  /** How many daily_job_logs rows this delete implicated. 0 = nothing to do. */
  attempted: number;
  dailyLogsUpdated: number;
  jobsUpdated: string[];
  /** Human-readable failures, safe to surface to an admin. */
  failed: string[];
}

async function recomputeDerivedHoursForDay(params: {
  userId: string;
  date: string;
  tenantId: string | null;
}): Promise<RecomputeResult> {
  const { userId, date, tenantId } = params;
  const touchedJobs = new Set<string>();
  const failed: string[] = [];
  let dailyLogsUpdated = 0;
  let attempted = 0;

  try {
    // Scoped by operator_id, NOT tenant_id, on purpose: the caller already
    // proved this card belongs to their tenant, and `daily_job_logs.tenant_id`
    // is null on older rows (see the daily-log route's "unstamped rows vanish
    // from tenant-filtered reads" note). Filtering on it here would skip exactly
    // those rows and leave them holding hours from the deleted card.
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('daily_job_logs')
      .select('id, job_order_id')
      .eq('operator_id', userId)
      .eq('log_date', date);

    if (logsError) {
      failed.push(`Could not read daily job logs for ${date}: ${logsError.message}`);
      return { ok: false, attempted: 0, dailyLogsUpdated: 0, jobsUpdated: [], failed };
    }
    if (!logs || logs.length === 0) {
      return { ok: true, attempted: 0, dailyLogsUpdated: 0, jobsUpdated: [], failed };
    }
    attempted = logs.length;

    // The cards that SURVIVED the delete, for this person on this date.
    let remainingQuery = supabaseAdmin
      .from('timecards')
      .select('clock_in_time, clock_out_time, total_hours, is_shop_hours, work_location')
      .eq('user_id', userId)
      .eq('date', date);
    if (tenantId) remainingQuery = remainingQuery.eq('tenant_id', tenantId);
    const { data: remainingCards, error: remainingError } = await remainingQuery;

    // Without the surviving cards we cannot compute the new hours at all — and
    // treating that as "0 cards remain" would zero out legitimate hours.
    if (remainingError) {
      failed.push(`Could not read remaining timecards for ${date}: ${remainingError.message}`);
      return { ok: false, attempted, dailyLogsUpdated: 0, jobsUpdated: [], failed };
    }

    for (const log of logs) {
      if (!log.job_order_id) continue;

      const { data: job, error: jobError } = await supabaseAdmin
        .from('job_orders')
        .select('work_started_at, route_started_at, work_completed_at')
        .eq('id', log.job_order_id)
        .maybeSingle();
      if (jobError) {
        failed.push(`Could not read job ${log.job_order_id}: ${jobError.message}`);
        continue;
      }
      if (!job) continue;

      const hours = (remainingCards || []).reduce(
        (sum, card) => sum + boundedJobHours(card, job),
        0
      );

      const { error: logErr } = await supabaseAdmin
        .from('daily_job_logs')
        .update({ hours_worked: Number(hours.toFixed(2)) })
        .eq('id', log.id);
      if (logErr) {
        failed.push(
          `Job ${log.job_order_id} still shows the deleted entry's hours for ${date}: ${logErr.message}`
        );
        continue;
      }
      dailyLogsUpdated += 1;
      touchedJobs.add(log.job_order_id);
    }

    // Roll each touched job's total back up from its (now-corrected) daily logs.
    for (const jobId of touchedJobs) {
      const { data: jobLogs, error: jobLogsError } = await supabaseAdmin
        .from('daily_job_logs')
        .select('hours_worked')
        .eq('job_order_id', jobId);
      if (jobLogsError) {
        failed.push(`Could not re-total job ${jobId}: ${jobLogsError.message}`);
        continue;
      }
      const total = (jobLogs || []).reduce(
        (sum, l) => sum + (Number(l.hours_worked) || 0),
        0
      );
      const { error: jobUpdateError } = await supabaseAdmin
        .from('job_orders')
        .update({ total_hours_worked: Number(total.toFixed(2)) })
        .eq('id', jobId);
      if (jobUpdateError) {
        failed.push(
          `Job ${jobId} total hours are stale (still include the deleted entry): ${jobUpdateError.message}`
        );
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[timecard delete] derived-hours recompute failed:', e);
    failed.push(`Unexpected recompute error: ${msg}`);
  }

  if (failed.length > 0) {
    console.error('[timecard delete] recompute incomplete:', { userId, date, failed });
  }

  return {
    ok: failed.length === 0,
    attempted,
    dailyLogsUpdated,
    jobsUpdated: [...touchedJobs],
    failed,
  };
}

/**
 * Undo the archive row when the delete that follows it did not happen.
 *
 * WHY THIS IS CHECKED: a leftover archive row asserts that a timecard was
 * deleted while that timecard is still live. Restoring from it later would
 * re-create the entry and produce a DUPLICATE PAID ENTRY — the same person paid
 * twice for one shift. If we cannot clean it up we cannot fix it from here, so
 * we log everything an operator needs to remove the row by hand.
 *
 * Deletes by the archive row's OWN id — never by (original_timecard_id,
 * deleted_by), which would take out an earlier legitimate archive row for the
 * same card if it was ever restored and re-deleted by the same admin.
 */
async function rollbackArchive(archiveRowId: string, timecardId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('deleted_timecards')
    .delete()
    .eq('id', archiveRowId);

  if (error) {
    console.error(
      '[timecard delete] CRITICAL: PHANTOM ARCHIVE ROW. The delete failed but its archive ' +
        'row could not be rolled back. That row claims a deletion that never happened — ' +
        'restoring from it would create a DUPLICATE PAID ENTRY. Delete it by hand: ' +
        `DELETE FROM deleted_timecards WHERE id = '${archiveRowId}';`,
      { archiveRowId, timecardId, error: error.message }
    );
  }
}

/**
 * DELETE /api/admin/timecards/[id]
 *
 * Removes ONE timecard entry. Built for the founder's case: someone clocked in
 * and out more than once in a day and the office needs to drop a specific one.
 *
 * NOTE multiples are often LEGITIMATE (two jobs in a day, or shop time after
 * field time) — this endpoint makes no judgment about which entry is wrong and
 * never deletes anything on its own. An admin names the entry and the reason.
 *
 * ARCHIVE-THEN-DELETE (why not a `deleted_at` flag): `timecards` is read by 108
 * TypeScript call sites plus five Postgres views and several triggers. A
 * soft-delete flag is only correct if every one of them filters it, and a single
 * missed read path keeps paying someone for an entry the office believes is
 * gone — a silent error that lands in a paycheck. Hard-deleting makes every read
 * path correct by construction; the payroll record is preserved by snapshotting
 * the full row AND its cascade children into `deleted_timecards` first. The
 * delete is therefore fully reversible from the archive.
 *
 * TENANT SCOPE: strictly the caller's own tenant. Unlike GET, this handler does
 * NOT honour a `?tenantId=` override — a cross-tenant payroll deletion should
 * not be reachable by editing a query string. The practical consequence is that
 * a PONTIFEX (parent-org) super_admin cannot delete a Patriot timecard at all;
 * the approved-card override belongs to that tenant's own super_admin. That
 * isolation is intentional.
 *
 * Body: { reason: string }  (required, stored on the archive + audit rows)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: timecardId } = await params;
    // Deliberately auth.tenantId only — no ?tenantId= override (see the header
    // comment). A super_admin with no tenant of their own cannot delete here.
    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        {
          error:
            'Your account is not scoped to a tenant, so it cannot delete timecard entries. Timecards can only be deleted by an admin of the company that owns them.',
        },
        { status: 400 }
      );
    }

    let body: { reason?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body — the reason gate below produces the right 400.
    }

    // Fetch-then-verify, tenant-scoped: a cross-tenant id must look like it
    // simply does not exist (404), never like a permission error (which would
    // confirm the row exists in another tenant).
    const { data: card, error: fetchError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('id', timecardId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (fetchError && !isTableNotFoundError(fetchError)) {
      console.error('Error fetching timecard for delete:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch timecard' }, { status: 500 });
    }
    if (!card) {
      return NextResponse.json({ error: 'Timecard not found' }, { status: 404 });
    }

    // Role gate + mandatory reason + approved-card lock (pure rules, unit-tested
    // in lib/timecard-delete.test.ts).
    const permission = canDeleteTimecard({
      card,
      role: auth.role,
      reason: body.reason,
    });
    if (!permission.allowed) {
      const status =
        permission.code === 'forbidden_role'
          ? 403
          : permission.code === 'approved_locked'
            ? 409
            : 400;
      return NextResponse.json({ error: permission.message, code: permission.code }, { status });
    }
    const reason = normalizeDeleteReason(body.reason as string);

    // ── Snapshot the cascade children BEFORE deleting ────────────────────────
    // These all have ON DELETE CASCADE against timecards, so they are destroyed
    // the instant the row goes — irreversibly. Capturing them is what makes the
    // archive a complete, restorable record.
    //
    // FAIL CLOSED. supabase-js does NOT throw on a query error, it returns
    // `{ data: null, error }`. Ignoring `error` here would turn any transient
    // failure into "this table had no children", the archive would insert
    // happily, and the cascade would erase rows that are now recoverable from
    // nowhere. The ONLY error we tolerate is "table doesn't exist" (environments
    // that never ran a given migration) — everything else aborts before the
    // point of no return.
    const related: Record<string, unknown[]> = {};
    const childTables: Array<[string, string]> = [
      ['timecard_breaks', 'timecard_id'],
      ['timecard_correction_requests', 'timecard_id'],
      ['timecard_gps_logs', 'legacy_timecard_id'],
      ['timecard_pay_links', 'timecard_id'],
    ];
    for (const [table, column] of childTables) {
      let data: unknown[] | null = null;
      let snapshotError: { message?: string } | null = null;
      try {
        const result = await supabaseAdmin.from(table).select('*').eq(column, timecardId);
        data = result.data;
        snapshotError = result.error;
      } catch (e) {
        snapshotError = { message: e instanceof Error ? e.message : String(e) };
      }

      if (snapshotError && !isTableNotFoundError(snapshotError)) {
        console.error(`Error snapshotting ${table} before timecard delete:`, snapshotError);
        return NextResponse.json(
          {
            error: `Could not read the linked ${table.replace(/_/g, ' ')} for this entry, so it was NOT deleted. Deleting now would destroy those records permanently. Try again.`,
          },
          { status: 500 }
        );
      }
      if (data && data.length > 0) related[table] = data;
    }

    // `operator_workflow_sessions.timecard_id` is a nullable FK with NO ACTION,
    // so it BLOCKS the delete rather than cascading — it has to be detached
    // below. Snapshot which sessions get detached FIRST: nulling the column is
    // itself destructive (the link is recoverable from nowhere afterwards), and
    // "fully reconstructible" has to include it.
    let detachedSessionIds: string[] = [];
    {
      let sessions: Array<{ id: string }> | null = null;
      let sessionError: { message?: string } | null = null;
      try {
        const result = await supabaseAdmin
          .from('operator_workflow_sessions')
          .select('id')
          .eq('timecard_id', timecardId);
        sessions = result.data;
        sessionError = result.error;
      } catch (e) {
        sessionError = { message: e instanceof Error ? e.message : String(e) };
      }

      if (sessionError && !isTableNotFoundError(sessionError)) {
        console.error('Error snapshotting operator_workflow_sessions before delete:', sessionError);
        return NextResponse.json(
          {
            error:
              'Could not read the linked operator workflow sessions for this entry, so it was NOT deleted. Try again.',
          },
          { status: 500 }
        );
      }
      detachedSessionIds = (sessions || []).map((s) => s.id);
      if (detachedSessionIds.length > 0) {
        related.operator_workflow_sessions_detached = detachedSessionIds;
      }
    }

    // ── Write the archive row FIRST ──────────────────────────────────────────
    // If this insert fails we abort: no delete may happen without its payroll
    // record. This is the one step in the flow that is NOT best-effort.
    // `.select('id').single()` so we can roll back THIS row by its own primary
    // key. Rolling back by (original_timecard_id, deleted_by) would delete a
    // PRIOR legitimate archive row if the same admin ever restores an entry and
    // deletes it again — destroying the older payroll record.
    const { data: archiveRow, error: archiveError } = await supabaseAdmin
      .from('deleted_timecards')
      .insert({
        original_timecard_id: card.id,
        tenant_id: card.tenant_id ?? tenantId,
        user_id: card.user_id,
        date: card.date,
        clock_in_time: card.clock_in_time,
        clock_out_time: card.clock_out_time,
        total_hours: card.total_hours,
        job_order_id: card.job_order_id,
        entry_type: card.entry_type,
        was_approved: card.is_approved === true || card.approval_status === 'approved',
        timecard: card,
        related,
        reason,
        deleted_by: auth.userId,
        deleted_by_email: auth.userEmail,
        deleted_by_role: auth.role,
      })
      .select('id')
      .single();

    if (archiveError || !archiveRow) {
      console.error('Error archiving timecard before delete:', archiveError);
      return NextResponse.json(
        {
          error:
            'Could not archive this entry, so it was NOT deleted. Payroll entries are never removed without an audit record.',
        },
        { status: 500 }
      );
    }

    // Detach the workflow sessions (NO ACTION FK — it would block the delete).
    // The session rows themselves are workflow history worth keeping; their ids
    // are already snapshotted into `related` above so the link is restorable.
    if (detachedSessionIds.length > 0) {
      const { error: detachError } = await supabaseAdmin
        .from('operator_workflow_sessions')
        .update({ timecard_id: null })
        .eq('timecard_id', timecardId);
      if (detachError) {
        console.error('Error detaching workflow sessions:', detachError);
        await rollbackArchive(archiveRow.id, timecardId);
        return NextResponse.json(
          {
            error:
              'Could not detach the linked workflow sessions, so the entry was NOT deleted. Try again.',
          },
          { status: 500 }
        );
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from('timecards')
      .delete()
      .eq('id', timecardId)
      .eq('tenant_id', tenantId);

    if (deleteError) {
      console.error('Error deleting timecard:', deleteError);
      // Re-attach the sessions we detached — the card is still live, so leaving
      // them detached would silently lose the link on a failed delete.
      if (detachedSessionIds.length > 0) {
        const { error: reattachError } = await supabaseAdmin
          .from('operator_workflow_sessions')
          .update({ timecard_id: timecardId })
          .in('id', detachedSessionIds);
        if (reattachError) {
          console.error(
            '[timecard delete] CRITICAL: could not re-attach workflow sessions after a failed delete. ' +
              'Sessions are orphaned from a still-live timecard. Re-link manually.',
            { timecardId, detachedSessionIds, error: reattachError.message }
          );
        }
      }
      await rollbackArchive(archiveRow.id, timecardId);
      return NextResponse.json(
        { error: 'Failed to delete timecard', details: deleteError.message },
        { status: 500 }
      );
    }

    // ── Correct everything derived from the removed card ─────────────────────
    // Week/payroll totals need no action: they are summed live from `timecards`
    // on every read, so the entry is gone from them the moment the row is.
    // `daily_job_logs.hours_worked` / `job_orders.total_hours_worked` are STORED
    // and must be rewritten.
    const recompute = await recomputeDerivedHoursForDay({
      userId: card.user_id,
      date: card.date,
      tenantId,
    });

    // ── Audit (non-negotiable for payroll): full before-state snapshot ────────
    logAuditEvent({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: 'timecard_delete',
      resourceType: 'timecards',
      resourceId: timecardId,
      details: {
        reason,
        employee_id: card.user_id,
        date: card.date,
        clock_in_time: card.clock_in_time,
        clock_out_time: card.clock_out_time,
        total_hours: card.total_hours,
        regular_hours: card.regular_hours,
        overtime_hours: card.overtime_hours,
        double_time_hours: card.double_time_hours,
        labor_cost: card.labor_cost,
        job_order_id: card.job_order_id,
        entry_type: card.entry_type,
        is_shop_hours: card.is_shop_hours,
        clock_in_method: card.clock_in_method,
        auto_closed: card.auto_closed,
        was_approved: card.is_approved === true || card.approval_status === 'approved',
        archived_to: 'deleted_timecards',
        archive_row_id: archiveRow.id,
        related_snapshot_counts: Object.fromEntries(
          Object.entries(related).map(([k, v]) => [k, v.length])
        ),
        detached_workflow_session_ids: detachedSessionIds,
        // Recorded even (especially) when it failed: a false `recompute_ok` is
        // the difference between "nothing needed doing" and "a job is still
        // billed for hours that no longer exist".
        recompute_ok: recompute.ok,
        recompute,
      },
      request,
    });

    // ── Tell the employee their hours changed ────────────────────────────────
    // Deliberate: someone's pay just changed and they did not do it. Silent
    // payroll edits are how disputes start — the person whose hours moved
    // should see it in their bell the same day, not at paycheck time. Reason
    // text is intentionally NOT included (it is office-internal and may name
    // other people); the operator sees what and when, and who to ask.
    // Fire-and-forget: notification trouble must never fail the delete.
    Promise.resolve(
      sendNotification({
        userId: card.user_id,
        tenantId: card.tenant_id ?? tenantId,
        category: 'general',
        notificationType: 'timecard_deleted',
        inAppType: 'warning',
        title: 'A timecard entry was removed',
        message: `The office removed a timecard entry for ${formatDay(card.date, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })}${card.total_hours ? ` (${Number(card.total_hours).toFixed(2)} hrs)` : ''}. Contact the office if this looks wrong.`,
        actionUrl: '/dashboard/timecard',
        relatedEntityType: 'timecards',
        relatedEntityId: timecardId,
        metadata: { date: card.date, total_hours: card.total_hours },
      })
    ).catch(() => {});

    // The entry IS deleted at this point, so this is a success — but if the
    // derived job hours could not be corrected, the admin has to know, because
    // a job is still billed for hours that no longer exist and nothing else
    // will tell them. `warning` is surfaced as a toast by the UI.
    return NextResponse.json({
      success: true,
      data: {
        id: timecardId,
        date: card.date,
        total_hours: card.total_hours,
        archived: true,
        recompute,
      },
      warning: recompute.ok
        ? undefined
        : 'The entry was deleted, but the job hours it fed could NOT be recalculated. Re-check the job’s hours — it may still include this entry.',
    });
  } catch (error: unknown) {
    console.error('Unexpected error in DELETE /api/admin/timecards/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
