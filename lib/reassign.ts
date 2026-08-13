/**
 * Shared operator-reassignment logic — the ONE write path for changing who is
 * on a job. Used by BOTH /api/admin/schedule-board/assign and
 * /api/admin/schedule-board/reorder so the semantics can't drift.
 *
 * Semantics (decided Aug 2026, "wrong operator / day-2 operator" fix):
 *   • `job_orders.assigned_to`      = the CURRENT lead (today's, or the job's
 *                                     lead when no per-day override applies).
 *   • `job_daily_assignments` (JDA) = the per-day ledger + history. One row
 *                                     per (job, date); `day_sequence` orders
 *                                     an operator's several jobs within a day.
 *
 * Scopes:
 *   • 'remaining' — "I put the wrong operator on": upsert JDA rows for every
 *     date from assignment_date → end_date AND set assigned_to. Only written
 *     when a caller asks for it explicitly, and only on genuinely multi-day
 *     jobs (is_multi_day; a stale end_date is not a span).
 *   • 'day' (DEFAULT) — "different operator for day 2 only": upsert JDA for that one
 *     date; set assigned_to ONLY if that date is tenant-local today (future
 *     'day' overrides are applied by the morning dispatch sync).
 *
 * Sequencing (founder Aug 2: one-job-per-operator-per-day rule DROPPED):
 *   • An operator may hold 2+ jobs per date. No more 409 on "already booked" —
 *     the new job appends as max(day_sequence)+1 by default.
 *   • position 'first' makes the new job the operator's #1 that day (existing
 *     rows shift up by one).
 *   • When swapping the operator on a date the job already occupied, its
 *     existing day_sequence is preserved unless the new operator already has
 *     jobs that date (then append / 'first').
 *
 * Status guard (everywhere): only promote scheduled/pending_approval →
 * 'assigned'. NEVER downgrade in_route/on_site/in_progress/pending_completion,
 * and never re-stamp assigned_at on a live job.
 *
 * Outgoing-operator preservation: if the previous lead already submitted work
 * (daily_job_logs or work_items) they are crewed onto the job as a 'helper'
 * (job_crew) so their access + submitted work stays reachable.
 */
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAuditEvent } from '@/lib/audit';
import { sendNotification } from '@/lib/send-reminder';
import { sendSMS } from '@/lib/sms';
import { enumerateYMDRange } from '@/lib/dates';

export type ReassignScope = 'day' | 'remaining';
export type ReassignPosition = 'first' | 'last';

// ─── Pure helpers (unit-tested in lib/reassign.test.ts) ────────────────────

/**
 * Expand a scope into the list of assignment dates to write.
 * 'day'       → just the assignment date.
 * 'remaining' → assignment date through the job's end_date (inclusive);
 *               single-day jobs (no end_date / end before the date) collapse
 *               to just the assignment date.
 *
 * `isMultiDay` is the job's own `is_multi_day` flag and it OVERRIDES end_date.
 *
 * WHY (founder, Aug 11): JOB-2026-895358 (Pratt) is flagged `is_multi_day =
 * false` but carries `end_date = 2026-08-17`, a week past its start. Assigning
 * an operator to it wrote SEVEN ledger rows — one per day to that phantom end
 * date — so the crew's phone showed the same ticket waiting for them every day
 * for a week. Nine of the 33 live jobs since June have this shape, so it is a
 * data pattern, not a one-off. `end_date` alone was never a safe span source:
 * a job the office called single-day must never claim anyone beyond its day.
 */
export function expandScopeDates(
  scope: ReassignScope,
  assignmentDate: string,
  endDate?: string | null,
  isMultiDay: boolean = true
): string[] {
  if (scope === 'day') return [assignmentDate];
  if (!isMultiDay) return [assignmentDate];
  if (!endDate || endDate <= assignmentDate) return [assignmentDate];
  return enumerateYMDRange(assignmentDate, endDate);
}

/** Statuses that may be promoted to 'assigned' when an operator is set. */
const PROMOTABLE_STATUSES = ['scheduled', 'pending_approval'];

/**
 * Status-guard predicate: promote to 'assigned' only from a pre-work status.
 * Live jobs (in_route/on_site/in_progress/pending_completion/…) keep their
 * status and their original assigned_at.
 *
 * A job is ASSIGNED once anybody is on it — operator or helper.
 *
 * FOUNDER (Aug 13): "Sometimes helpers just need to know where the address is
 * and get out there. I want to dispatch a ticket to them, but I can't right now
 * unless I assign them as the operator, even though they don't have to fill an
 * operator ticket. So I'd like to be able to assign and choose a helper, and not
 * have to assign an operator if I don't want to."
 *
 * This used to read `!!operatorId` alone, which meant a helper-only job stayed
 * `scheduled` forever: never promoted, never dispatched, never reaching the
 * person expected on site. Worse, the downgrade below was its mirror — putting a
 * helper on an already-assigned job pushed it BACK to `scheduled`, quietly
 * un-dispatching a job the office had just crewed.
 *
 * Helper is optional so existing two-argument callers keep compiling; every
 * caller that can know the helper now passes it.
 */
export function shouldPromoteToAssigned(
  currentStatus: string | null | undefined,
  operatorId: string | null,
  helperId?: string | null
): boolean {
  const someoneIsOnIt = !!operatorId || !!helperId;
  return someoneIsOnIt && !!currentStatus && PROMOTABLE_STATUSES.includes(currentStatus);
}

/**
 * Unassigning only downgrades a job that is merely 'assigned' (not live) — and
 * only when the job is left with NOBODY on it. A crew of one helper is still a
 * crew.
 */
export function shouldDowngradeToScheduled(
  currentStatus: string | null | undefined,
  operatorId: string | null,
  helperId?: string | null
): boolean {
  const nobodyLeft = !operatorId && !helperId;
  return nobodyLeft && currentStatus === 'assigned';
}

/**
 * Compute the day_sequence for a job landing on an operator's date.
 *  - `sameOperator` (the job's existing ledger row already belongs to this
 *    operator — e.g. a resubmit that only changed the helper) → PRESERVE the
 *    job's existing sequence; append/'first' apply only on a real operator
 *    change (guardian B2: a helper edit must not flip the op's #1 job to #3).
 *  - No other jobs that day → keep the job's existing sequence (or 1).
 *  - position 'last' → max(existing sequences) + 1.
 *  - position 'first' → 1 (caller shifts the operator's other rows up first).
 */
export function computeDaySequence(
  otherSequences: number[],
  ownExistingSequence: number | null | undefined,
  position: ReassignPosition,
  sameOperator = false
): number {
  if (sameOperator && ownExistingSequence != null) return ownExistingSequence;
  if (otherSequences.length === 0) return ownExistingSequence ?? 1;
  if (position === 'first') return 1;
  return Math.max(...otherSequences) + 1;
}

/**
 * Pure planning core of the ledger write: given the sequence landscape,
 * decide each date's day_sequence and which existing rows must shift up
 * (position 'first' on a real operator change). Shifts are emitted highest
 * sequence first so executing them in order never trips the
 * (operator, date, sequence) unique index. Unit-tested directly.
 */
export function planLedgerSequences(
  dates: string[],
  othersByDate: Map<string, { id: string; day_sequence: number }[]>,
  ownByDate: Map<string, { day_sequence: number; operator_id: string | null }>,
  operatorId: string | null,
  position: ReassignPosition
): { sequences: Record<string, number>; shifts: { id: string; newSequence: number }[] } {
  const sequences: Record<string, number> = {};
  const shifts: { id: string; newSequence: number }[] = [];

  for (const d of dates) {
    const own = ownByDate.get(d);
    const sameOperator = !!operatorId && !!own && own.operator_id === operatorId;
    const others = othersByDate.get(d) || [];

    if (!operatorId) {
      sequences[d] = own?.day_sequence ?? 1; // unassigned rows keep their slot
      continue;
    }
    if (!sameOperator && position === 'first' && others.length > 0) {
      for (const row of [...others].sort((a, b) => b.day_sequence - a.day_sequence)) {
        shifts.push({ id: row.id, newSequence: row.day_sequence + 1 });
      }
    }
    sequences[d] = computeDaySequence(
      others.map((r) => r.day_sequence),
      own?.day_sequence,
      position,
      sameOperator
    );
  }
  return { sequences, shifts };
}

/**
 * Same-day sequence gate predicate (pure — used by /api/job-orders/[id]/status).
 * A LOWER-sequence job blocks starting a later one only when it is genuinely
 * still today's unfinished work:
 *  - NOT completed / cancelled, no work_completed_at;
 *  - NOT parked on_hold (guardian B1: the not-ready flow parks job #1 with its
 *    ledger row intact — job #2 must be startable);
 *  - no day-completed daily log for today;
 *  - its scheduled window still COVERS today (guardian B4: a job moved to
 *    another date can leave a stale ledger row behind — that must not block).
 */
export function sequenceBlocks(
  job: {
    status: string | null;
    work_completed_at: string | null;
    scheduled_date: string | null;
    end_date: string | null;
  },
  hasDayCompletedLogToday: boolean,
  today: string
): boolean {
  if (job.work_completed_at) return false;
  if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'on_hold') return false;
  if (hasDayCompletedLogToday) return false;
  // Stale ledger row: the job's own window no longer covers today.
  if (!job.scheduled_date || job.scheduled_date > today) return false;
  const spanEnd = job.end_date || job.scheduled_date;
  if (spanEnd < today) return false;
  return true;
}

// ─── Result / params ────────────────────────────────────────────────────────

export interface ReassignActor {
  userId: string;
  userEmail: string;
  role: string;
}

export interface ReassignParams {
  jobOrderId: string;
  /** New lead operator (null = unassign). */
  operatorId: string | null;
  /**
   * New helper. `undefined` = keep the job's current helper (reorder path);
   * `null` = clear the helper.
   */
  helperId?: string | null;
  /** YYYY-MM-DD the change anchors on (the board's viewed date). */
  assignmentDate: string;
  scope: ReassignScope;
  /** Where in the operator's day this job lands when they already have jobs. */
  position?: ReassignPosition;
  tenantId: string;
  actor: ReassignActor;
  request?: NextRequest;
}

export type ReassignResult =
  | {
      ok: true;
      job: {
        id: string;
        job_number: string;
        customer_name: string;
        assigned_to: string | null;
        helper_assigned_to: string | null;
        status: string;
      };
      /** day_sequence written for the anchor assignment_date. */
      day_sequence: number;
      /** How many jobs the operator now has on the anchor date (incl. this). */
      operator_day_job_count: number;
      /** date → day_sequence for every date written. */
      sequences: Record<string, number>;
    }
  | {
      ok: false;
      status: number;
      error: string;
      details?: string;
      conflict_job_id?: string;
      block_type?: 'sequence_race';
    };

// ─── Small internals ────────────────────────────────────────────────────────

/** Tenant-local YYYY-MM-DD "today" (falls back to America/New_York). */
async function tenantLocalToday(tenantId: string): Promise<string> {
  let tz = 'America/New_York';
  try {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('timezone')
      .eq('id', tenantId)
      .maybeSingle();
    if (data?.timezone) tz = data.timezone;
  } catch {
    /* non-critical — fall back */
  }
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

async function profileName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  return data?.full_name ?? null;
}

/** Human label for the scope, used in notes + old-operator notification. */
function scopeLabel(scope: ReassignScope, assignmentDate: string, dates: string[]): string {
  const pretty = new Date(assignmentDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (scope === 'day' || dates.length <= 1) return pretty;
  return `${pretty} and remaining days`;
}

/** "1st" / "2nd" / "3rd" / "4th" … */
export function ordinal(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
}

interface JdaRow {
  id: string;
  job_order_id: string;
  assignment_date: string;
  day_sequence: number;
}

/**
 * Write the JDA ledger rows for all dates in scope, computing/shifting
 * day_sequence per date (decision logic lives in planLedgerSequences, which
 * is pure and unit-tested). Also reports the anchor date's PREVIOUS ledger
 * operator so the caller can notify the outgoing day-operator on future-day
 * overrides (guardian NIT3).
 */
async function writeLedgerRows(params: {
  jobOrderId: string;
  operatorId: string | null;
  helperId: string | null;
  operatorName: string | null;
  helperName: string | null;
  dates: string[];
  position: ReassignPosition;
  tenantId: string;
  actorId: string;
}): Promise<
  | { sequences: Record<string, number>; anchorOthers: number; previousDayOperatorId: string | null }
  | { error: 'race' | 'failed' }
> {
  const { jobOrderId, operatorId, helperId, operatorName, helperName, dates, position, tenantId, actorId } = params;

  // The operator's OTHER rows across the scope dates (sequence landscape).
  // Not tenant-filtered on purpose: legacy JDA rows can carry tenant_id NULL
  // and operator_id is already bound to one tenant's profile, so this cannot
  // read cross-tenant data — but a tenant filter could miss a row the unique
  // index (operator_id, assignment_date, day_sequence) still enforces.
  const othersByDate = new Map<string, JdaRow[]>();
  if (operatorId) {
    const { data: otherRows } = await supabaseAdmin
      .from('job_daily_assignments')
      .select('id, job_order_id, assignment_date, day_sequence')
      .eq('operator_id', operatorId)
      .in('assignment_date', dates)
      .neq('job_order_id', jobOrderId);
    for (const r of (otherRows || []) as JdaRow[]) {
      const list = othersByDate.get(r.assignment_date) || [];
      list.push(r);
      othersByDate.set(r.assignment_date, list);
    }
  }

  // The job's own existing rows across the dates — sequence AND operator, so
  // a same-operator resubmit (e.g. helper-only edit) PRESERVES its slot
  // (guardian B2) and so we know who the previous day-operator was (NIT3).
  const { data: ownRows } = await supabaseAdmin
    .from('job_daily_assignments')
    .select('id, job_order_id, assignment_date, day_sequence, operator_id')
    .eq('job_order_id', jobOrderId)
    .in('assignment_date', dates);
  const ownByDate = new Map<string, { day_sequence: number; operator_id: string | null }>();
  for (const r of (ownRows || []) as (JdaRow & { operator_id: string | null })[]) {
    ownByDate.set(r.assignment_date, { day_sequence: r.day_sequence, operator_id: r.operator_id ?? null });
  }
  const previousDayOperatorId = ownByDate.get(dates[0])?.operator_id ?? null;

  const { sequences, shifts } = planLedgerSequences(dates, othersByDate, ownByDate, operatorId, position);

  // Execute shifts in plan order (highest sequence first per date) so the
  // (operator, date, sequence) unique index never sees a transient duplicate.
  for (const shift of shifts) {
    const { error: shiftError } = await supabaseAdmin
      .from('job_daily_assignments')
      .update({ day_sequence: shift.newSequence, updated_at: new Date().toISOString() })
      .eq('id', shift.id);
    if (shiftError) {
      console.error('reassign: sequence shift failed:', shiftError);
      return { error: shiftError.code === '23505' ? 'race' : 'failed' };
    }
  }

  const nowIso = new Date().toISOString();
  const rows = dates.map((d) => ({
    job_order_id: jobOrderId,
    assignment_date: d,
    operator_id: operatorId ?? null,
    helper_id: helperId ?? null,
    operator_name: operatorName,
    helper_name: helperName,
    day_sequence: sequences[d],
    assigned_by: actorId,
    tenant_id: tenantId,
    updated_at: nowIso,
  }));

  const { error: jdaError } = await supabaseAdmin
    .from('job_daily_assignments')
    .upsert(rows, { onConflict: 'job_order_id,assignment_date' });

  if (jdaError) {
    console.error('reassign: JDA upsert failed:', jdaError);
    return { error: jdaError.code === '23505' ? 'race' : 'failed' };
  }

  const anchorOthers = (othersByDate.get(dates[0]) || []).length;
  return { sequences, anchorOthers, previousDayOperatorId };
}

// ─── The write path ─────────────────────────────────────────────────────────

export async function applyReassignment(params: ReassignParams): Promise<ReassignResult> {
  const { jobOrderId, operatorId, assignmentDate, scope, tenantId, actor, request } = params;
  const position: ReassignPosition = params.position === 'first' ? 'first' : 'last';

  // 1. Fetch the job (tenant-scoped — prevents cross-tenant writes via UUID).
  const { data: job } = await supabaseAdmin
    .from('job_orders')
    .select(
      'id, job_number, customer_name, location, job_type, arrival_time, assigned_to, helper_assigned_to, status, scheduled_date, end_date, is_multi_day, dispatched_at, tenant_id'
    )
    .eq('id', jobOrderId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!job) {
    return { ok: false, status: 404, error: 'Job not found' };
  }

  // undefined helper = preserve the job's current helper (reorder drag path).
  const helperId = params.helperId === undefined ? (job.helper_assigned_to ?? null) : params.helperId;

  const dates = expandScopeDates(scope, assignmentDate, job.end_date, job.is_multi_day === true);

  // 2. Names for the JDA ledger rows.
  const [operatorName, helperName] = await Promise.all([
    profileName(operatorId),
    profileName(helperId),
  ]);

  // 3. Write the per-day ledger (sequence-aware). One retry on a sequence
  //    race — two admins assigning the same operator at the same instant can
  //    both compute the same next sequence; the unique index rejects one, and
  //    the loser recomputes against the fresh landscape.
  let ledger: { sequences: Record<string, number>; anchorOthers: number; previousDayOperatorId: string | null } | null = null;
  for (let attempt = 0; attempt < 2 && !ledger; attempt++) {
    const result = await writeLedgerRows({
      jobOrderId,
      operatorId,
      helperId,
      operatorName,
      helperName,
      dates,
      position,
      tenantId,
      actorId: actor.userId,
    });
    if ('error' in result) {
      if (result.error === 'race' && attempt === 0) continue;
      if (result.error === 'race') {
        return {
          ok: false,
          status: 409,
          error: 'Assignment collided with a simultaneous change.',
          details: 'Someone else changed this operator’s day at the same moment. Refresh the board and try again.',
          block_type: 'sequence_race',
        };
      }
      return { ok: false, status: 500, error: 'Failed to save per-day assignment' };
    }
    ledger = result;
  }
  if (!ledger) {
    return { ok: false, status: 500, error: 'Failed to save per-day assignment' };
  }

  // 4. Decide whether job_orders.assigned_to (the "current lead") changes:
  //    'remaining' always rewrites the lead; 'day' only when the day is today
  //    (a future 'day' override is applied by the morning dispatch sync).
  //
  //    DO NOT add `|| !job.assigned_to` here. It looks like the natural way to
  //    make the new scope-'day' default safe ("a first assignment for a future
  //    date would otherwise leave the job with no lead"), and it is not needed:
  //    the morning sync in lib/dispatch.ts promotes that day's ledger row into
  //    assigned_to when the day arrives, and every later day then falls back to
  //    it. Reviewed and reverted on Aug 11 because it broke two things:
  //
  //      • It routed around the `previousDayOperatorId` branch below, so the
  //        operator who lost their day was never told they had been taken off.
  //      • A ONE-DAY action on a lead-less job took the writeLead branch and
  //        rewrote job_orders globally — clearing a row for a single day
  //        stripped the helper from every day of the job.
  const today = await tenantLocalToday(tenantId);
  const writeLead = scope === 'remaining' || assignmentDate === today;

  let updatedJob = {
    id: job.id,
    job_number: job.job_number,
    customer_name: job.customer_name,
    assigned_to: job.assigned_to as string | null,
    helper_assigned_to: job.helper_assigned_to as string | null,
    status: job.status as string,
  };

  const prevOperatorId: string | null = job.assigned_to ?? null;
  const prevHelperId: string | null = job.helper_assigned_to ?? null;
  const nowIso = new Date().toISOString();

  if (writeLead) {
    const updateData: Record<string, unknown> = {
      assigned_to: operatorId ?? null,
      helper_assigned_to: helperId ?? null,
      updated_at: nowIso,
    };
    // STATUS GUARD: promote only pre-work statuses; never downgrade a live job;
    // never re-stamp assigned_at on a live job.
    if (shouldPromoteToAssigned(job.status, operatorId, helperId)) {
      updateData.status = 'assigned';
      updateData.assigned_at = nowIso;
    } else if (shouldDowngradeToScheduled(job.status, operatorId, helperId)) {
      updateData.status = 'scheduled';
      updateData.assigned_at = null;
    }

    const { data: u, error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update(updateData)
      .eq('id', jobOrderId)
      .eq('tenant_id', tenantId)
      .select('id, job_number, customer_name, assigned_to, helper_assigned_to, status')
      .single();

    if (updateError) {
      console.error('reassign: job_orders update failed:', updateError);
      return { ok: false, status: 500, error: 'Failed to update job assignment' };
    }
    if (u) updatedJob = u;

    // 5. Outgoing-operator preservation: if the replaced lead already submitted
    //    work on this job, keep them on the crew so their access + submitted
    //    work stays reachable (job_crew is honored by the my-jobs API).
    //
    //    ROLE MUST BE 'operator', NOT 'helper'. They ran the job as the lead —
    //    demoting them flips their ticket to the light helper form (one text
    //    box) instead of the full work-performed input, so the work they still
    //    owe for that day can no longer be entered the way it was started.
    if (operatorId && prevOperatorId && prevOperatorId !== operatorId) {
      try {
        const [{ data: logRow }, { data: itemRow }] = await Promise.all([
          supabaseAdmin
            .from('daily_job_logs')
            .select('id')
            .eq('job_order_id', jobOrderId)
            .eq('operator_id', prevOperatorId)
            .limit(1)
            .maybeSingle(),
          supabaseAdmin
            .from('work_items')
            .select('id')
            .eq('job_order_id', jobOrderId)
            .eq('created_by', prevOperatorId)
            .limit(1)
            .maybeSingle(),
        ]);
        if (logRow || itemRow) {
          await supabaseAdmin.from('job_crew').upsert(
            {
              tenant_id: tenantId,
              job_order_id: jobOrderId,
              user_id: prevOperatorId,
              role: 'operator',
              added_by: actor.userId,
            },
            { onConflict: 'job_order_id,user_id', ignoreDuplicates: true }
          );
        }
      } catch (e) {
        // Non-fatal — reassignment already landed; log and continue.
        console.error('reassign: job_crew preservation failed:', e);
      }
    }
  }

  // ── Side effects: all fire-and-forget (never block or fail the API) ──────
  const operatorChanged = operatorId !== prevOperatorId;
  const helperChanged = helperId !== prevHelperId;
  const whenLabel = scopeLabel(scope, assignmentDate, dates);
  const anchorSequence = ledger.sequences[assignmentDate] ?? 1;
  const anchorDayJobCount = ledger.anchorOthers + 1;

  // Audit
  logAuditEvent({
    userId: actor.userId,
    userEmail: actor.userEmail,
    userRole: actor.role,
    action: operatorId ? (prevOperatorId && operatorChanged ? 'reassign' : 'assign') : 'unassign',
    resourceType: 'job_order',
    resourceId: jobOrderId,
    details: {
      operatorId,
      helperId,
      previousOperatorId: prevOperatorId,
      assignment_date: assignmentDate,
      scope,
      position,
      dates,
      sequences: ledger.sequences,
      jobNumber: job.job_number,
    },
    request,
  });

  // History row + change_log note (mirrors admin/job-orders/[id] PATCH).
  if (writeLead && (operatorChanged || helperChanged)) {
    Promise.resolve(
      (async () => {
        const actorName = (await profileName(actor.userId)) || actor.userEmail;
        const prevOperatorName = await profileName(prevOperatorId);
        const prevHelperName = await profileName(prevHelperId);

        const changes: Record<string, { old: unknown; new: unknown }> = {};
        if (operatorChanged) changes.assigned_to = { old: prevOperatorId, new: operatorId };
        if (helperChanged) changes.helper_assigned_to = { old: prevHelperId, new: helperId };

        await supabaseAdmin.from('job_orders_history').insert({
          job_order_id: jobOrderId,
          job_number: job.job_number,
          changed_by: actor.userId,
          changed_by_name: actorName,
          changed_by_role: actor.role,
          change_type: 'updated',
          changes,
          snapshot: { ...job, ...updatedJob },
        });

        const lines: string[] = [];
        if (operatorChanged) {
          lines.push(`Operator: "${prevOperatorName || '(unassigned)'}" → "${operatorName || '(unassigned)'}" (${whenLabel})`);
        }
        if (helperChanged) {
          lines.push(`Helper: "${prevHelperName || '(none)'}" → "${helperName || '(none)'}" (${whenLabel})`);
        }
        if (operatorId && anchorDayJobCount > 1) {
          lines.push(`Sequenced as ${operatorName || 'operator'}'s ${ordinal(anchorSequence)} job of the day.`);
        }
        await supabaseAdmin.from('job_notes').insert({
          job_order_id: jobOrderId,
          author_id: actor.userId,
          author_name: actorName,
          content: lines.join('\n'),
          note_type: 'change_log',
          metadata: { changes, assignment_date: assignmentDate, scope, position, sequences: ledger!.sequences },
        });
      })()
    ).catch(() => {});
  }

  // Notify the NEW operator (schedule bell + unified channels).
  if (operatorId && operatorChanged) {
    Promise.resolve(
      (async () => {
        const scheduledPretty = new Date(assignmentDate + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        const seqSuffix =
          anchorDayJobCount > 1 ? ` This is your ${ordinal(anchorSequence)} job that day.` : '';

        // Schedule-board bell (existing operator UX — keep the shape).
        await supabaseAdmin.from('schedule_notifications').insert({
          recipient_id: operatorId,
          job_order_id: jobOrderId,
          type: 'job_assigned',
          title: `You've been assigned: ${job.job_number}`,
          message: `${job.customer_name} at ${job.location || 'TBD'} on ${scheduledPretty}.${seqSuffix}`,
          metadata: {
            job_number: job.job_number,
            customer_name: job.customer_name,
            location: job.location,
            scheduled_date: assignmentDate,
            arrival_time: job.arrival_time,
            job_type: job.job_type,
            scope,
            day_sequence: anchorSequence,
          },
        });

        // On a genuine REASSIGNMENT (someone was replaced), also push through
        // the unified channels — the dispatch latch (dispatched_at) is one-time,
        // so a post-dispatch replacement would otherwise never hear about it.
        if (prevOperatorId) {
          await sendNotification({
            userId: operatorId,
            tenantId,
            category: 'job_dispatched',
            title: 'New job assigned 📋',
            message: `${job.job_number} for ${job.customer_name || 'a customer'} has been assigned to you (${whenLabel}).${seqSuffix}`,
            inAppType: 'job_order',
            jobOrderId,
            actionUrl: '/dashboard/my-jobs',
          });

          // Ticket already dispatched → text the incoming operator the ticket
          // (same message shape as lib/dispatch.ts) so they aren't left waiting
          // for a morning dispatch that already happened.
          if (job.dispatched_at) {
            const { data: prof } = await supabaseAdmin
              .from('profiles')
              .select('phone_number')
              .eq('id', operatorId)
              .maybeSingle();
            if (prof?.phone_number) {
              const formatTime = (t: string | null) => {
                if (!t) return '';
                const [h, m] = t.split(':');
                const hour = parseInt(h);
                return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
              };
              const msg = [
                `📋 Job Dispatched — ${scheduledPretty}`,
                `Job #: ${job.job_number}`,
                `Customer: ${job.customer_name}`,
                `Location: ${job.location}`,
                job.arrival_time ? `Arrival: ${formatTime(job.arrival_time)}` : null,
                job.job_type ? `Type: ${job.job_type}` : null,
                anchorDayJobCount > 1 ? `(Your ${ordinal(anchorSequence)} job that day)` : null,
                'Open the Pontifex app → My Jobs to view your ticket.',
              ]
                .filter(Boolean)
                .join('\n');
              await sendSMS({ to: prof.phone_number, message: msg, jobId: jobOrderId }).catch((e) =>
                console.error('reassign SMS failed:', e)
              );
            }
          }
        }
      })()
    ).catch(() => {});
  }

  // Notify the NEW helper (schedule bell — existing shape).
  if (helperId && helperChanged) {
    Promise.resolve(
      (async () => {
        const scheduledPretty = new Date(assignmentDate + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        await supabaseAdmin.from('schedule_notifications').insert({
          recipient_id: helperId,
          job_order_id: jobOrderId,
          type: 'job_assigned',
          title: `You've been assigned as helper: ${job.job_number}`,
          message: `${job.customer_name} at ${job.location || 'TBD'} on ${scheduledPretty} (helper role).`,
          metadata: { job_number: job.job_number, is_helper: true, scope },
        });
      })()
    ).catch(() => {});
  }

  // Notify the OLD operator they were taken off (shape mirrors the
  // job_cancelled block in admin/job-orders/[id]/route.ts).
  // Two cases:
  //  • writeLead (today / 'remaining') → the job's previous lead (assigned_to).
  //  • future 'day' override (writeLead false) → the anchor date's previous
  //    LEDGER operator (guardian NIT3: they'd otherwise never hear their day
  //    was taken). Falls back to the lead when the date had no ledger row yet.
  const outgoingId = writeLead
    ? (operatorChanged ? prevOperatorId : null)
    : (ledger.previousDayOperatorId ?? prevOperatorId);
  if (outgoingId && outgoingId !== operatorId) {
    Promise.resolve(
      supabaseAdmin.from('notifications').insert({
        user_id: outgoingId,
        tenant_id: tenantId,
        type: 'info',
        notification_type: 'job_reassigned',
        title: 'Assignment changed',
        message: `You've been taken off ${job.job_number} (${job.customer_name || 'customer'}) for ${whenLabel}.`,
        job_id: jobOrderId,
        related_entity_type: 'job_order',
        related_entity_id: jobOrderId,
        read: false,
        is_read: false,
        priority: 'high',
        created_at: nowIso,
      })
    ).catch(() => {});
  }

  return {
    ok: true,
    job: updatedJob,
    day_sequence: anchorSequence,
    operator_day_job_count: anchorDayJobCount,
    sequences: ledger.sequences,
  };
}
