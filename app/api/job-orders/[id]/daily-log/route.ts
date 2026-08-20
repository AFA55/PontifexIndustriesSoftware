export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/job-orders/[id]/daily-log
 * Submit daily completion log for multi-day jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
// The read guard's own day test — imported, never re-implemented. See
// `sameDayStamp` below for what a second copy of this rule would cost.
import { dateInTz } from '@/lib/reminder-timing';
import { boundedJobHours, clampDailyLogHours, MAX_DAILY_LOG_HOURS } from '@/lib/labor-cost';
import { dayCompletePermission } from '@/lib/day-complete-auth';
import {
  planDayCloseout,
  continueConfirmMessage,
  continueNextDayJobUpdate,
  finalCompletionJobUpdate,
  CONTINUE_CONFIRMATION_REQUIRED,
} from '@/lib/day-closeout';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Get user from authorization token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      workPerformed,
      notes,
      signerName,
      signatureData,
      continueNextDay,
      latitude,
      longitude,
      stayed_overnight,
      work_date
    } = body;

    // Get job order (scoped to tenant)
    const tenantId = await getTenantId(user.id);

    // Resolve role to determine whether tenantId null is acceptable (super_admin only)
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (!tenantId && callerProfile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Tenant context required' },
        { status: 403 }
      );
    }

    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Verify user is assigned to this job (primary operator or helper)
    const isOperator = job.assigned_to === user.id;
    const isHelper = job.helper_assigned_to === user.id;
    if (!isOperator && !isHelper) {
      // Allow admins/managers to bypass assignment check
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const adminRoles = ['admin', 'super_admin', 'operations_manager'];
      const isAdmin = profile && adminRoles.includes(profile.role);

      if (!isAdmin) {
        // Crew members (job_crew, ANY role) never complete the ticket — that's
        // the LEAD's job. Checked BEFORE the existing-log fallback: the crew
        // flow gives them daily_job_logs rows (day notes / drafts), and those
        // must not unlock day-complete. The fallback below stays for genuine
        // ex-leads only (logged work, no longer in any slot, NOT crewed).
        const [{ data: crewRow }, { data: existingLog }] = await Promise.all([
          supabaseAdmin
            .from('job_crew')
            .select('id')
            .eq('job_order_id', jobId)
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle(),
          supabaseAdmin
            .from('daily_job_logs')
            .select('id')
            .eq('job_order_id', jobId)
            .eq('operator_id', user.id)
            .limit(1)
            .maybeSingle(),
        ]);
        const decision = dayCompletePermission({
          isLead: isOperator,
          isHelperSlot: isHelper,
          isAdmin: false,
          isCrewMember: !!crewRow,
          hasExistingLog: !!existingLog,
        });
        if (!decision.allowed) {
          return NextResponse.json(
            {
              error:
                decision.reason === 'crew_not_lead'
                  ? 'Only the lead completes the ticket. Your submitted work is already on it.'
                  : 'You are not assigned to this job',
            },
            { status: 403 }
          );
        }
      }
    }

    const now = new Date().toISOString();
    // Tenant timezone FIRST — server is UTC on Vercel; every date below must
    // be the tenant's calendar, and late completions must be able to backfill.
    let tenantTz = 'America/New_York';
    try {
      const { data: tzRow } = await supabaseAdmin
        .from('tenants')
        .select('timezone')
        .eq('id', tenantId)
        .maybeSingle();
      if (tzRow?.timezone) tenantTz = tzRow.timezone;
    } catch { /* default tz, same as clock-in route */ }
    const todayTz = new Date().toLocaleDateString('en-CA', { timeZone: tenantTz });
    // LATE COMPLETION (founder Jul 20): an operator finishing a ticket AFTER
    // its scheduled day passes work_date so the log books to the day the work
    // actually happened — not the submission day. Clamped: a valid calendar
    // date, not before the job's scheduled date, never in the future.
    const requestedWorkDate = typeof work_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(work_date)
      ? work_date
      : null;
    const effectiveDate =
      requestedWorkDate &&
      requestedWorkDate <= todayTz &&
      (!job.scheduled_date || requestedWorkDate >= job.scheduled_date)
        ? requestedWorkDate
        : todayTz;
    const isBackfill = effectiveDate !== todayTz;

    // ─── A one-day job may not become a multi-day job on one tap ─────────────
    //
    // "Done for Today" writes `is_multi_day: true` + `status: 'scheduled'`. On
    // a job the office booked for a single day that quietly changes what kind
    // of job it is: it overruns end_date, falls out of the operator's day list
    // (that query needs end_date >= today), reschedules itself indefinitely,
    // never completes and never reaches invoicing. JOB-2026-160762 went that
    // way on Aug 14 and had to be rescued by hand.
    //
    // The UI asks first (components/DayCloseoutChoice). This is the backstop
    // for a stale schedule read on the phone, and it is deliberately placed
    // BEFORE the first write in this handler: a refusal must cost the operator
    // nothing but a tap, never a lost day's work.
    if (continueNextDay) {
      const plan = planDayCloseout({
        // The TENANT's calendar, matching every other date in this handler.
        // Never effectiveDate: a backfilled log books work to a past day but
        // the question — "are you coming back tomorrow" — is about today.
        today: todayTz,
        scheduledDate: job.scheduled_date ?? null,
        scheduledEndDate: job.scheduled_end_date ?? job.end_date ?? null,
      });
      if (plan.requiresContinueConfirmation && body.confirm_continue_next_day !== true) {
        return NextResponse.json(
          {
            error: CONTINUE_CONFIRMATION_REQUIRED,
            message: plan.confirm ? continueConfirmMessage(plan.confirm) : undefined,
            confirm: plan.confirm,
          },
          { status: 409 }
        );
      }
    }

    // ─── Subsistence (out-of-town overnight) — fire-and-forget side effect ───
    // Never trust the client for the out-of-town gate: re-derive from the DB job.
    // This MUST NOT block or fail the operator's day-complete flow.
    const jobIsOutOfTown = job?.scheduling_flexibility?.out_of_town === true;
    // Backfilled logs never write subsistence — the overnight question is about
    // TONIGHT; retroactive nights are an admin correction, not an operator claim.
    if (jobIsOutOfTown && typeof stayed_overnight === 'boolean' && !isBackfill) {
      // Calendar night in the TENANT timezone — MUST match the clock-in route's
      // derivation (app/api/timecard/clock-in/route.ts) exactly, or a late-night
      // US clock-in and this day-complete write land on different night_date rows
      // and the (operator_id, night_date) unique row never converges → a single
      // night gets double-counted in payroll. NEVER toLocalYMD() (server-local =
      // UTC on Vercel) here. Default tz mirrors the clock-in route.
      const nightDate = todayTz;
      if (stayed_overnight === true) {
        // Idempotent: one subsistence night per operator per calendar date.
        Promise.resolve(
          supabaseAdmin.from('subsistence_nights').upsert(
            {
              tenant_id: tenantId,
              operator_id: user.id,
              night_date: nightDate,
              job_order_id: jobId,
              job_number: job.job_number ?? null,
              source: 'operator',
            },
            { onConflict: 'operator_id,night_date' }
          )
        ).then(() => {}).catch(() => {});
      } else {
        // Operator corrected an earlier "yes" → remove the night for this date.
        Promise.resolve(
          supabaseAdmin
            .from('subsistence_nights')
            .delete()
            .eq('operator_id', user.id)
            .eq('night_date', nightDate)
        ).then(() => {}).catch(() => {});
      }
    }

    // Calculate hours worked today — BOUNDED (founder Aug 1: the "57-hour job").
    // Prefer the operator's timecards for the day, but never book a whole card
    // to the job: each card contributes only boundedJobHours() — the
    // intersection of its clocked span with the job's activity window
    // (work_started_at ?? route_started_at → work_completed_at ?? clock-out),
    // shop-flagged cards contribute 0, and hours are capped at the card's
    // lunch-adjusted total_hours. Summing ALL of the day's cards also fixes the
    // old first-card-only read (a morning shop card used to book its shop
    // hours to the job). Rules + tests live in lib/labor-cost.ts.
    let hoursWorked = 0;
    let hoursSource: 'timecard' | 'wall_clock' = 'wall_clock';
    try {
      const { data: dayCards } = await supabaseAdmin
        .from('timecards')
        .select('clock_in_time, clock_out_time, total_hours, is_shop_hours, work_location')
        .eq('user_id', user.id)
        .eq('date', effectiveDate)
        .order('clock_in_time', { ascending: true });
      if (dayCards && dayCards.length > 0) {
        hoursWorked = dayCards.reduce((sum, tc) => sum + boundedJobHours(tc, job), 0);
        // A timecard day of ONLY shop cards legitimately books 0 job hours —
        // do NOT fall through to wall-clock in that case.
        hoursSource = 'timecard';
      }
    } catch {
      // fall through to wall-clock fallback
    }
    if (hoursSource !== 'timecard') {
      if (isBackfill) {
        // A late completion with no timecard for that day: NEVER wall-clock
        // (now - start_of_that_day would book a day-plus of hours). Zero it —
        // admins reconcile hours from the timecard side.
        hoursWorked = 0;
      } else {
        // Wall-clock fallback (no timecard yet), now BOUNDED TO TODAY. The
        // verified 52.59h prod row happened here: work_started_at survived
        // from 2 days earlier (operator skipped the "continue next day" path
        // that clears it), so now − work_started_at crossed calendar days.
        // Rule: hours can never exceed (a) time since the TENANT-LOCAL
        // midnight (a same-day log cannot contain yesterday), nor
        // (b) MAX_DAILY_LOG_HOURS (16h hard ceiling).
        const routeStarted = job.route_started_at ? new Date(job.route_started_at) : null;
        const workStarted = job.work_started_at ? new Date(job.work_started_at) : null;
        const startTime = workStarted || routeStarted;
        const rawHours = startTime
          ? (new Date().getTime() - startTime.getTime()) / 3600000
          : 0;
        let sinceLocalMidnight = MAX_DAILY_LOG_HOURS;
        try {
          const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tenantTz,
            hourCycle: 'h23',
            hour: '2-digit',
            minute: '2-digit',
          }).formatToParts(new Date());
          const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN);
          const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? NaN);
          if (Number.isFinite(hh) && Number.isFinite(mm)) {
            sinceLocalMidnight = hh + mm / 60;
          }
        } catch { /* keep the 16h ceiling */ }
        hoursWorked = clampDailyLogHours(
          Math.min(rawHours, sinceLocalMidnight),
          MAX_DAILY_LOG_HOURS
        );
      }
    }

    // Merge notes instead of overwriting: the work-performed page may have
    // already stored the operator's typed/voice day note on this row (see
    // /api/job-orders/[id]/work-items). Append this flow's note to it rather
    // than clobbering the morning's note; skip the append if it's already there
    // (idempotent resubmit).
    let mergedNotes: string | null = notes || null;
    let priorRouteStart: string | null = null;
    let priorWorkStart: string | null = null;
    /**
     * SENT-BUT-NOT-LOADED IS A WIPE.
     *
     * The read below is the ONLY thing that knows what is already on this row.
     * PostgREST does not throw on a failed read — it returns `{ data: null,
     * error }` — so without inspecting `error`, a dead query is indistinguishable
     * from "there is no prior row": `priorRouteStart` stays null, the job-level
     * fallback is rejected by `sameDayStamp` on any day but its own, and the
     * upsert then writes NULL over a genuine same-day press.
     *
     * Measured against production rather than assumed: 33 `daily_job_logs` rows
     * carry a start stamp on their own `log_date`, and on SIXTEEN of them the
     * job-level fallback is null or belongs to another day — so a failed read
     * would have written NULL over a genuine same-day press. (All 16 lose
     * `route_started_at`; 13 of those lose `work_started_at` too.) They are
     * precisely the rows this change exists to protect.
     *
     * So on ANY failure the two start columns are OMITTED from the payload
     * entirely (see `startStampPatch`). PostgREST leaves unlisted columns untouched
     * on the UPDATE arm of an upsert, so the row keeps whatever it had; on the
     * INSERT arm there is nothing to lose. The closeout still succeeds — a
     * failed read must not block an operator finishing his day — it simply
     * declines to assert anything about stamps it could not see.
     */
    let priorStartsKnown = true;
    try {
      const { data: priorLog, error: priorErr } = await supabaseAdmin
        .from('daily_job_logs')
        // `route_started_at` / `work_started_at` come back too — this upsert
        // rewrites the whole row, so anything already on it that we do not
        // carry forward is DESTROYED. See `sameDayStamp` below.
        .select('notes, route_started_at, work_started_at')
        .eq('job_order_id', jobId)
        .eq('operator_id', user.id)
        .eq('log_date', effectiveDate)
        .maybeSingle();
      if (priorErr) {
        // A missing table is not a failed read of an existing row: there is no
        // prior row anywhere, nothing can be wiped, and the upsert below has its
        // own `isTableNotFoundError` path. Everything else is a read we cannot
        // trust, so we decline to write the columns it was meant to protect.
        if (!isTableNotFoundError(priorErr)) {
          priorStartsKnown = false;
          console.error('daily-log: prior-row read failed; leaving start stamps untouched', priorErr);
        }
        throw priorErr;
      }
      const priorRow = priorLog as {
        notes: string | null;
        route_started_at: string | null;
        work_started_at: string | null;
      } | null;
      priorRouteStart = priorRow?.route_started_at ?? null;
      priorWorkStart = priorRow?.work_started_at ?? null;
      const prior = priorRow?.notes || null;
      if (prior && mergedNotes && prior !== mergedNotes && !prior.includes(mergedNotes)) {
        mergedNotes = `${prior} | ${mergedNotes}`;
      } else if (prior && !mergedNotes) {
        mergedNotes = prior;
      }
    } catch (err) {
      // A THROW IS THE SAME UNKNOWN AS AN ERROR OBJECT. Network failure,
      // abort, a client bug — none of them tell us what is on the row, and the
      // whole point of this guard is that not knowing means not writing.
      if (!isTableNotFoundError(err)) priorStartsKnown = false;
      /* best-effort merge — fall back to the incoming note */
    }

    /**
     * A DAY'S LOG MUST NOT CARRY ANOTHER DAY'S PRESS.
     *
     * This upsert used to write `route_started_at: job.route_started_at` flat.
     * A job's press is stamped ONCE, ever — `status/route.ts` sets it only
     * `if (!existingJob.route_started_at)` — so on day 2 and after, that copies
     * day 1's timestamp onto today's row. TWENTY-TWO of the fifty-four
     * production log rows that carry a press are such copies (re-counted Aug 20
     * 2026; it was 13 of 53 when the read guard shipped, so this is still
     * happening), and every one is a ten-hour phantom waiting: JOB-2026-277097's 8/12
     * closeout row carries 8/10 07:43, filed from a different job's truck.
     *
     * `jobStartOnDate` (lib/job-day-boundary.ts, guard (a)) already REJECTS them
     * at read time, so nothing is mis-billed today. This stops manufacturing
     * them, which matters for the same reason the guard does: a stamp that looks
     * like a press is one refactor away from being believed as one. It is the
     * write half of the fix whose read half is the close fallback.
     *
     * DELIBERATELY NOT TOUCHED: the job-level `job_orders.route_started_at`.
     * `app/api/admin/jobs/[id]/timestamps/route.ts` documents it as the editable
     * canonical press, and the completed-jobs list, job P&L and JobDetailView
     * all read it as "when this job started". Redefining it as "the latest
     * press" would move boundaries on jobs the office has already invoiced —
     * a larger and separate decision. Here the job stamp is still the source; it
     * is simply not written to a day it did not happen on.
     */
    // ONE COPY OF THE DAY TEST, NOT TWO. This used to re-implement `dateInTz`
    // inline (`toLocaleDateString('en-CA', { timeZone })`). It was the same rule
    // as guard (a) in lib/job-day-boundary.ts written out a second time, and the
    // failure mode of two copies of one rule is that they drift APART silently:
    // the write guard would start admitting a stamp the read guard rejects, or
    // the reverse, and nothing would fail — the hours would simply be wrong.
    // The read guard's own helper is imported instead.
    const sameDayStamp = (iso: string | null | undefined): string | null =>
      iso && dateInTz(iso, tenantTz) === effectiveDate ? iso : null;
    // A per-day stamp already on the row outranks the job-level one and must
    // survive the upsert; the job stamp is the fallback, and only on its own day.
    //
    // When the prior-row read failed we know NEITHER, so both columns are left
    // OUT OF THE PAYLOAD entirely rather than written as null — see the note on
    // `priorStartsKnown`. Spread rather than `undefined` values: a key that is
    // never in the object cannot be resurrected by a serializer that decides to
    // keep undefined, and the intent reads off the page.
    const startStampPatch: {
      route_started_at?: string | null;
      work_started_at?: string | null;
    } = priorStartsKnown
      ? {
          route_started_at: sameDayStamp(priorRouteStart) ?? sameDayStamp(job.route_started_at),
          work_started_at: sameDayStamp(priorWorkStart) ?? sameDayStamp(job.work_started_at),
        }
      : {};

    // Create daily log entry — gracefully handle missing table
    let dailyLog = null;
    const { data: logData, error: logError } = await supabaseAdmin
      .from('daily_job_logs')
      // Upsert on the (job_order_id, operator_id, log_date) unique key so a legitimate
      // resubmit (corrected work, draft -> final) updates the row instead of failing 500.
      .upsert({
        job_order_id: jobId,
        operator_id: user.id,
        log_date: effectiveDate,
        // Stamp tenant_id: no trigger sets it; unstamped rows vanish from
        // tenant-filtered admin reads (undercounted hours on completed tickets).
        tenant_id: job.tenant_id ?? null,
        // NOT `job.route_started_at` — see `sameDayStamp` above. Absent
        // entirely when the prior-row read failed, so a dead query leaves the
        // row's own press alone instead of erasing it.
        ...startStampPatch,
        day_completed_at: now,
        work_performed: workPerformed || [],
        notes: mergedNotes,
        hours_worked: Number(hoursWorked.toFixed(2)),
        daily_signer_name: signerName || null,
        daily_signature_data: signatureData || null,
        route_start_latitude: job.route_start_latitude,
        route_start_longitude: job.route_start_longitude,
        work_start_latitude: job.work_start_latitude,
        work_start_longitude: job.work_start_longitude,
        day_end_latitude: latitude,
        day_end_longitude: longitude
      }, { onConflict: 'job_order_id,operator_id,log_date' })
      .select()
      .single();

    if (logError) {
      // If table doesn't exist yet, continue without blocking
      if (isTableNotFoundError(logError)) {
        dailyLog = null;
      } else {
        console.error('Error creating daily log:', logError);
        return NextResponse.json(
          { error: 'Failed to create daily log' },
          { status: 500 }
        );
      }
    } else {
      dailyLog = logData;
    }

    // Persist work items to work_items table for billing.
    // These feed invoice generation, so the write is BLOCKING (not fire-and-forget) and
    // idempotent: clear this day's prior rows first so a resubmit replaces rather than
    // double-bills, and surface failures instead of silently producing a $0 invoice.
    if (workPerformed && Array.isArray(workPerformed) && workPerformed.length > 0) {
      const dayNum = dailyLog?.day_number ?? 1;

      // GUARD against detail loss: the work-performed page already wrote this
      // day's rows WITH details_json (all hole sizes/depths, cuts, wet/dry).
      // The day-complete hydrate only carries flattened fields, so a blind
      // delete+reinsert here would strip that richness minutes after it was
      // captured. If richer rows already exist and this payload carries no
      // details_json, keep the existing rows.
      const payloadHasDetails = workPerformed.some((it: any) => it && it.details_json);
      let skipRewrite = false;
      if (!payloadHasDetails) {
        const { data: existingRows } = await supabaseAdmin
          .from('work_items')
          .select('id, details_json')
          .eq('job_order_id', jobId)
          .eq('operator_id', user.id)
          .eq('day_number', dayNum)
          .limit(50);
        // Existing rows are richer than the incoming payload — keep them.
        skipRewrite = (existingRows || []).some((r: any) => r.details_json);
      }

      if (!skipRewrite) {
      const workItemRows = workPerformed.map((item: any) => {
        // The work-performed flow carries the category in `item.name` (see
        // /api/job-orders/[id]/work-items, which maps `work_type: item.name`).
        // The day-complete hydrate path uses `work_type`/`type`. Accept all three
        // rather than silently miscategorizing everything as 'General'.
        const resolvedWorkType = item.work_type || item.type || item.name;
        if (!resolvedWorkType) {
          // Surface the problem instead of hiding it under a friendly default.
          console.warn(
            `[daily-log] work item missing work_type/type/name for job ${jobId}, operator ${user.id}; storing as 'unspecified'`,
            item
          );
        }
        return {
        job_order_id: jobId,
        operator_id: user.id,
        // tenant_id has no auto-set trigger; without it, tenant-scoped admin
        // reads silently drop these rows.
        tenant_id: job.tenant_id ?? tenantId ?? null,
        day_number: dayNum,
        // The row's own identity, and the key the replace above uses.
        work_date: effectiveDate,
        // The log row this work belongs to. THE identity of "this operator's
        // work on this job on this date" — stable across resubmits because the
        // log is upserted on (job_order_id, operator_id, log_date). day_number
        // is NOT stable: it comes from a trigger and was observed changing
        // between two submits 53 seconds apart, which is how the same footage
        // ended up counted twice.
        daily_log_id: dailyLog?.id ?? null,
        work_type: resolvedWorkType || 'unspecified',
        quantity: Number(item.quantity) || 1,
        core_quantity: item.core_quantity ? Number(item.core_quantity) : null,
        core_size: item.core_size || null,
        core_depth_inches: item.core_depth_inches ? Number(item.core_depth_inches) : null,
        linear_feet_cut: item.linear_feet_cut ? Number(item.linear_feet_cut) : null,
        cut_depth_inches: item.cut_depth_inches ? Number(item.cut_depth_inches) : null,
        details_json: item.details_json ?? null,
        accessibility_rating: typeof item.accessibility_rating === 'string'
          ? ({ easy: 1, moderate: 2, medium: 3, difficult: 4, hard: 5 } as Record<string, number>)[item.accessibility_rating] || null
          : item.accessibility_rating ? Number(item.accessibility_rating) : null,
        notes: item.notes || null,
        };
      });

      // Replace any prior rows for this job/operator/day (idempotent resubmit,
      // no double-billing).
      //
      // Keyed on daily_log_id, NOT day_number. Scoping by day_number let a
      // resubmit land under a different number and ADD a second set of rows
      // instead of replacing the first — verified live on JOB-2026-364026,
      // where 2 ft of hand sawing was reported as 4 and 6 ft of push sawing
      // as 12. Both the delete and the insert now use the log row's id, so a
      // resubmit can only ever replace itself.
      //
      // day_number is still cleared alongside it to sweep up rows written
      // before daily_log_id was stamped.
      // Keyed on the DATE now, which is the same key the work-performed route
      // uses — so the two write paths can no longer disagree about which rows
      // this submission replaces. They previously derived day_number
      // differently, and every disagreement meant the delete matched nothing
      // and the insert simply added on top.
      const replaceQuery = supabaseAdmin
        .from('work_items')
        .delete()
        .eq('job_order_id', jobId)
        .eq('operator_id', user.id);
      const { error: replaceError } = dailyLog?.id
        ? await replaceQuery.or(`daily_log_id.eq.${dailyLog.id},work_date.eq.${effectiveDate}`)
        : await replaceQuery.eq('work_date', effectiveDate);
      if (replaceError) {
        console.error('Error clearing prior work items:', replaceError);
        return NextResponse.json(
          { error: 'Could not save your work — nothing was changed. Try again.' },
          { status: 500 }
        );
      }

      const { error: wiError } = await supabaseAdmin.from('work_items').insert(workItemRows);
      if (wiError) {
        console.error('Error saving work items to DB:', wiError);
        return NextResponse.json({ error: 'Failed to save work items' }, { status: 500 });
      }
      } // end !skipRewrite
    }

    if (continueNextDay) {
      // total_days_worked is NOT written here. It is derived by
      // trigger_update_total_days_worked from job_workday_evidence — the days
      // this job can PROVE a crew was on it. This line used to blind-increment
      // whatever it had read at the top of the request, which is how AM King
      // reached total_days_worked = 2 off a single log row: the triggers set it
      // to 1, then this added 1 to a stale read, and a one-day job printed as
      // two. Reset the timestamps for tomorrow; leave the counting alone.
      //
      // The exact fields live in lib/day-closeout.ts and are asserted in
      // lib/day-closeout.test.ts — `is_multi_day: true` is the line that costs
      // money when it is wrong, so it is pinned by a test rather than reviewed
      // by eye. Nothing reaches here without clearing the confirmation gate
      // above.
      const { error: updateError } = await supabaseAdmin
        .from('job_orders')
        .update(continueNextDayJobUpdate())
        .eq('id', jobId);

      if (updateError) {
        console.error('Error updating job for next day:', updateError);
      }

      // Cancel any stale completion requests when continuing to next day
      await supabaseAdmin
        .from('job_completion_requests')
        .update({ status: 'cancelled' })
        .eq('job_order_id', jobId)
        .in('status', ['pending', 'submitted']);

      // Reset workflow for next day — gracefully handle missing table
      const { error: workflowError } = await supabaseAdmin
        .from('workflow_steps')
        .update({
          current_step: 'equipment_checklist',
          equipment_checklist_completed: false,
          sms_sent: false,
          silica_form_completed: false,
          work_performed_completed: false,
          pictures_submitted: false,
          customer_signature_received: false
        })
        .eq('job_order_id', jobId)
        .eq('operator_id', user.id);

      if (workflowError && !(isTableNotFoundError(workflowError))) {
        console.error('Error resetting workflow for next day:', workflowError);
      }

      return NextResponse.json({
        success: true,
        message: 'Daily log saved. Job will continue tomorrow.',
        dailyLog,
        continueNextDay: true
      });
    } else {
      // This was the final day — if a signer was provided, this is a confirmed on-site
      // completion. Aggregate all daily logs and update job to completed as a fallback
      // (the day-complete page also calls /status PATCH, but this ensures consistency
      // even if that call is skipped or fires out of order).
      if (signerName) {
        try {
          const { data: allLogs } = await supabaseAdmin
            .from('daily_job_logs')
            .select('hours_worked, log_date, work_performed')
            .eq('job_order_id', jobId)
            .order('log_date', { ascending: true });

          const totalHours = (allLogs || []).reduce(
            (sum: number, l: any) => sum + (Number(l.hours_worked) || 0),
            0
          );
          // DISTINCT calendar dates, not row count — operator + helper each
          // log the same day, so length double-counts crew days (60-day
          // stress test, Jul 12). Matches the DB trigger's definition.
          const totalDays = new Set((allLogs || []).map((l: any) => String(l.log_date))).size;

          // AWAITED, deliberately — this used to be fire-and-forget, which does
          // not work on Vercel: the instance freezes once the response is sent
          // and the in-flight write is killed. This is the write that corrects a
          // wrongly-converted one-day job (`is_multi_day` derived from the
          // distinct days actually logged), so it has to actually land. One
          // extra round-trip on a once-per-job request is a fair price.
          // total_days_worked stays trigger-owned (see above) — writing a
          // locally-counted value here would overwrite the derived one moments
          // after the trigger set it.
          const { error: cErr } = await supabaseAdmin
            .from('job_orders')
            .update(
              finalCompletionJobUpdate({
                nowIso: now,
                totalHours,
                distinctDays: totalDays,
                signerName,
              })
            )
            .eq('id', jobId);
          if (cErr) console.warn('Fallback completion update failed:', cErr.message);
        } catch (finalErr) {
          console.warn('Fallback completion aggregation failed:', finalErr);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Daily log saved. Ready for final completion.',
        dailyLog,
        continueNextDay: false
      });
    }

  } catch (error: any) {
    console.error('Error in daily log submission:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve daily logs for a job
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify job belongs to user's tenant
    const tenantIdGet = await getTenantId(user.id);

    // Resolve role to determine whether tenantId null is acceptable (super_admin only)
    const { data: getCallerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (!tenantIdGet && getCallerProfile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Tenant context required' },
        { status: 403 }
      );
    }

    // Always verify job ownership; when tenantId is non-null, scope it; super_admin sees all
    const jobCheckQuery = supabaseAdmin
      .from('job_orders')
      .select('id')
      .eq('id', jobId);
    if (tenantIdGet) {
      const { data: jobCheck } = await jobCheckQuery.eq('tenant_id', tenantIdGet).maybeSingle();
      if (!jobCheck) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
    } else {
      // super_admin: verify job exists (no tenant scope)
      const { data: jobCheck } = await jobCheckQuery.maybeSingle();
      if (!jobCheck) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
    }

    // Get all daily logs for this job — gracefully handle missing table
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('daily_job_logs')
      .select('*')
      .eq('job_order_id', jobId)
      .order('log_date', { ascending: true });

    if (logsError) {
      // If table doesn't exist yet, return empty logs
      if (isTableNotFoundError(logsError)) {
        return NextResponse.json({ success: true, logs: [] });
      }
      return NextResponse.json(
        { error: 'Failed to fetch daily logs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      logs: logs || []
    });

  } catch (error: any) {
    console.error('Error fetching daily logs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
