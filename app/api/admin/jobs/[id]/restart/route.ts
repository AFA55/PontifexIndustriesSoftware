export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/jobs/[id]/restart
 *
 * Bring a parked job back onto the schedule with a new scope, KEEPING ITS JOB
 * NUMBER.
 *
 *   "I don't want to duplicate the ticket and extend dates, because then it
 *    would say that we've been working on it all week when that's not the
 *    case… same job ID should stay because same contract info."
 *
 * The existing answer to "different scope" was
 * `/api/admin/jobs/[id]/new-scope`, which INSERTS a child job with a new job
 * number — precisely what the founder rejected. This is the other answer: one
 * job, one contract, one ticket, a new run of work.
 *
 * What a restart does, in order:
 *   0. refuses anything that is not actually parked, and refuses a restart date
 *      that lands on or before a day this job has already worked — one mistyped
 *      digit otherwise re-files billed hours under a scope that did not exist
 *      on those days, on the sheet the customer signs;
 *   1. captures the OUTGOING scope onto phase 1 before overwriting it — this is
 *      the last moment it exists, and losing it would break "nothing typed is
 *      ever lost";
 *   2. opens a new phase starting on the restart date;
 *   3. puts the new scope on `job_orders.description`, because that (with
 *      `scope_details`) is what the crew's phone actually renders;
 *   4. releases the park and re-dates the job;
 *   5. writes an audit row.
 *
 * It does NOT renumber days, touch `total_days_worked`, or write
 * `daily_job_logs`. The per-phase ordinal is derived at read time from
 * `job_workday_evidence` — see `lib/job-phases.ts` for why that restraint is
 * load-bearing on billing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { planRestart, isParked, sortPhases, type JobPhase } from '@/lib/job-phases';
import { toLocalYMD } from '@/lib/dates';

/** A bare 'YYYY-MM-DD'. Anything else is a client bug, not a date. */
function isYMD(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** `started_on` of the run this job is coming back from, if it has one. */
function lastPhaseStartedOn(phases: readonly JobPhase[]): string | null {
  if (phases.length === 0) return null;
  const sorted = sortPhases(phases);
  return sorted[sorted.length - 1]?.started_on ?? null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Same guard as the park and reactivate routes this sits beside.
    // Deliberately NOT requireScheduleBoardAccess: that set includes
    // shop_manager, who is documented read-only and has no business changing a
    // customer's scope.
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id } = await context.params;
    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant scope required.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const scheduledDate = body?.scheduled_date;
    const endDate = body?.end_date ?? null;
    const scopeText =
      typeof body?.scope_text === 'string' ? body.scope_text.trim() : '';
    // THE OFFICE'S OWN WORDS FOR WHY IT CAME BACK. The modal has always
    // collected this ("Contractor called us back") and this route used to drop
    // it on the floor — read, sent, never referenced. It is the pause label on
    // the printed ticket when the park itself recorded no reason, which is
    // exactly Leifeng's case: `on_hold_reason` is null there, so without this
    // the sheet prints a blank "Reason:" on the one job the feature was built
    // for. Nothing typed is ever lost.
    const restartNote =
      typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (!isYMD(scheduledDate)) {
      return NextResponse.json(
        { error: 'scheduled_date is required (YYYY-MM-DD).' },
        { status: 400 }
      );
    }
    if (endDate !== null && !isYMD(endDate)) {
      return NextResponse.json(
        { error: 'end_date must be YYYY-MM-DD or null.' },
        { status: 400 }
      );
    }
    if (endDate && endDate < scheduledDate) {
      return NextResponse.json(
        { error: 'end_date cannot be before scheduled_date.' },
        { status: 400 }
      );
    }
    if (!scopeText) {
      return NextResponse.json(
        {
          error:
            'A scope for this run is required — it is what the crew will see on their phone.',
        },
        { status: 400 }
      );
    }

    // ── The job, tenant-scoped (never trust a UUID from the client) ─────────
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select(
        'id, job_number, customer_name, tenant_id, status, description, scheduled_date, assigned_to, helper_assigned_to, on_hold, on_hold_placed_at, on_hold_placed_by, on_hold_reason, on_hold_released_at'
      )
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (['completed', 'cancelled', 'archived'].includes(String(job.status))) {
      return NextResponse.json(
        {
          error: `This job is ${job.status} — restart it by reopening it first.`,
        },
        { status: 409 }
      );
    }

    // ── ONLY A PARKED JOB CAN BE RESTARTED ──────────────────────────────────
    // Without this the route accepted anything that was not completed —
    // including a job that is `in_progress` with a crew standing on the slab —
    // and then forced it back to 'assigned' and nulled its end dates. That is
    // precisely what `releaseParkedJobFields()` refuses to do three files away
    // ("downgrading a live job is how a working crew loses its place"); a
    // sibling route breaking its own rule is how the rule stops being one.
    //
    // Two shapes count as parked, because the flag and the timestamps drift
    // apart in production and BOTH drifts are real:
    //   • `isParked()` — the placement/release timestamps, the predicate every
    //     other surface uses (the Parked folder lists exactly these);
    //   • `status = 'on_hold'` with no `on_hold_placed_at` — a job stopped
    //     without going through the park route. Refusing this shape would
    //     refuse the founding case.
    const wasParked = isParked(job);
    const parkedByStatus = String(job.status) === 'on_hold';
    if (!wasParked && !parkedByStatus) {
      return NextResponse.json(
        {
          error:
            'Only a parked job can be restarted. Park this job first — the restart is what brings it back with a new scope.',
        },
        { status: 409 }
      );
    }

    // ── Existing phases ─────────────────────────────────────────────────────
    // A missing table means the migration has not been applied yet. Fail
    // CLOSED here — unlike the read-only ticket path, this route WRITES, and
    // silently restarting a job without recording the phase would lose the
    // outgoing scope permanently. That is the one outcome worse than an error.
    const { data: phaseRows, error: phaseErr } = await supabaseAdmin
      .from('job_phases')
      .select('id, job_order_id, phase_number, started_on, scope_text, parked_on, park_reason')
      .eq('job_order_id', id)
      .eq('tenant_id', tenantId)
      .order('phase_number', { ascending: true });

    if (phaseErr) {
      console.error('[restart] job_phases read failed:', phaseErr);
      return NextResponse.json(
        {
          error:
            'Park-and-restart is not available yet — the job_phases migration has not been applied.',
        },
        { status: 503 }
      );
    }

    const phases = (phaseRows ?? []) as JobPhase[];

    // ── The days this job can PROVE a crew was on it ────────────────────────
    // `job_workday_evidence` is the single definition of a proven day (a filed
    // log, or a named crew corroborated by that person's timecard) and is
    // service_role-only, which supabaseAdmin is. If it is unreachable, fall
    // back to the scheduled date rather than failing the restart.
    //
    // BOTH ENDS are taken. The earliest dates phase 1 when reconstructing it;
    // the LATEST is the floor the restart date has to clear — see the guard
    // below. Asking for `.limit(1)` gave only the first and left the guard with
    // nothing to stand on.
    const { data: evidence } = await supabaseAdmin
      .from('job_workday_evidence')
      .select('work_date')
      .eq('job_order_id', id)
      .order('work_date', { ascending: true });
    // Bare 'YYYY-MM-DD' strings straight from a DB `date` — never passed
    // through `new Date()`, and lexicographic order IS chronological order for
    // this format, which is what makes the min/max and the comparison below
    // timezone-proof.
    const provenDates = ((evidence ?? []) as Array<{ work_date: string | null }>)
      .map((r) => r.work_date)
      .filter((d): d is string => isYMD(d))
      .sort();
    const firstWorkedOn: string | null = provenDates[0] ?? null;
    const lastWorkedOn: string | null =
      provenDates.length > 0 ? provenDates[provenDates.length - 1] : null;

    // ── A RESTART CANNOT BE DATED INTO DAYS ALREADY WORKED ──────────────────
    //
    // `planRestart` writes `scheduled_date` straight to `job_phases.started_on`
    // and `phaseForDate()` assigns every date to the LAST phase started by
    // then. So one mistyped digit — 2026-08-12 for 2026-08-21 — silently
    // re-files days the crew already worked and the office already billed
    // under a scope that did not exist on those days, and manufactures a
    // "Work paused 2 days" band across a pause that never happened, on the
    // document the customer signs. A fully backwards date is worse still:
    // `sortPhases()` orders by `started_on`, so the new phase sorts FIRST and
    // the ticket prints the original scope as "New scope (phase 1)".
    //
    // The floor is the latest of everything already fixed in the past: the
    // job's proven work dates and the start of the run it is coming back from.
    // Equal is rejected too — a phase that starts on a day the previous run
    // worked has two claims on that day's hours.
    const restartFloor = [firstWorkedOn, lastWorkedOn, lastPhaseStartedOn(phases)]
      .filter((d): d is string => !!d)
      .sort()
      .pop();

    if (restartFloor && scheduledDate <= restartFloor) {
      return NextResponse.json(
        {
          error: `The restart date must be after ${restartFloor} — that is the last day already worked or scheduled under this job's current scope. A restart dated on or before it would re-file hours the customer was already billed for under the new scope.`,
        },
        { status: 400 }
      );
    }

    // The day the previous run stopped: the day it was parked, if it was.
    const parkedOn = job.on_hold_placed_at
      ? toLocalYMD(new Date(job.on_hold_placed_at as string))
      : null;

    const plan = planRestart({
      phases,
      restartOn: scheduledDate,
      newScopeText: scopeText,
      previousScopeText: (job.description as string | null) ?? null,
      firstWorkedOn,
      scheduledDate: (job.scheduled_date as string | null) ?? null,
      parkedOn,
    });

    const nowIso = new Date().toISOString();

    // WHY THE JOB SAT, IN WHATEVER WORDS EXIST. The reason recorded when it was
    // parked is the more precise account and wins; the note typed at restart is
    // the fallback, and is the ONLY one Leifeng has. This is what the ticket
    // prints under "Work paused N days" — `phaseGaps()` reads it off the phase
    // that ENDED, so it belongs on the outgoing row, not the new one.
    const pauseReason =
      ((job.on_hold_reason as string | null) ?? '').trim() || restartNote || null;

    // ── Write the phases FIRST ──────────────────────────────────────────────
    // If this fails, the job is untouched and the outgoing scope is still on
    // `description`. Writing the job first and failing here would overwrite the
    // old scope with nothing recording it — unrecoverable.
    const { error: insertErr } = await supabaseAdmin.from('job_phases').insert(
      plan.insert.map((p) => {
        // The row for the run STARTING now, as opposed to the phase-1 row
        // being reconstructed behind it. Keyed on the phase number rather than
        // on `parked_on`, which is null for a job stopped without a
        // `on_hold_placed_at` — that shape would have hung the pause reason on
        // the wrong row, or on neither.
        const isNewRun = p.phase_number === plan.newPhaseNumber;
        return {
          tenant_id: tenantId,
          job_order_id: id,
          phase_number: p.phase_number,
          started_on: p.started_on,
          scope_text: p.scope_text,
          parked_on: p.parked_on,
          park_reason: isNewRun ? null : pauseReason,
          parked_by: isNewRun ? null : ((job.on_hold_placed_by as string | null) ?? null),
          restarted_by: isNewRun ? auth.userId : null,
          created_by: auth.userId,
        };
      })
    );

    if (insertErr) {
      console.error('[restart] job_phases insert failed:', insertErr);
      return NextResponse.json(
        { error: 'Failed to record the new phase. The job was not changed.' },
        { status: 500 }
      );
    }

    // ── Stamp the run that just ended, when it already had a row ────────────
    // (A first restart has no prior row; its phase 1 was just INSERTed above
    // carrying both stamps.) The reason is filled in only where the phase does
    // not already carry one, so a park that recorded why is never overwritten
    // by a note typed later.
    const priorPhase = phases.length > 0 ? sortPhases(phases)[phases.length - 1] : null;
    if (priorPhase) {
      const closeFields: Record<string, unknown> = {};
      if (plan.closePhase) closeFields.parked_on = plan.closePhase.parked_on;
      if (pauseReason && !(priorPhase.park_reason ?? '').trim()) {
        closeFields.park_reason = pauseReason;
      }
      if (Object.keys(closeFields).length > 0) {
        const { error: closeErr } = await supabaseAdmin
          .from('job_phases')
          .update({ ...closeFields, updated_at: nowIso })
          .eq('job_order_id', id)
          .eq('tenant_id', tenantId)
          .eq('phase_number', plan.closePhase?.phase_number ?? priorPhase.phase_number);
        // Non-fatal: the gap on the ticket is computed from the days actually
        // worked either side, not from this stamp. It only labels the pause.
        if (closeErr) console.error('[restart] closing prior phase failed:', closeErr);
      }
    }

    // ── Then the job ────────────────────────────────────────────────────────
    const { error: jobErr } = await supabaseAdmin
      .from('job_orders')
      .update({
        scheduled_date: scheduledDate,
        end_date: endDate,
        scheduled_end_date: endDate,
        // The crew's phone reads `description`. The OLD wording is safe on
        // phase 1 above, which is what makes overwriting this survivable.
        description: scopeText,
        // These two exist on job_orders and have never been written by
        // anything. They are exactly what they say, and the phase panel reads
        // them — so the office can finally see that a scope changed under a
        // crew. `scope_version` is deliberately NOT written: `phase_number` is
        // the counter for this, and a second one is the parallel system this
        // feature was told not to build.
        last_scope_update_at: nowIso,
        last_scope_updated_by: auth.userId,
        on_hold: false,
        on_hold_released_at: nowIso,
        // THE STATUS RULE IS `releaseParkedJobFields()`'s, VERBATIM: re-status
        // only a job whose status still says 'on_hold'. It is written inline
        // here rather than delegated because this route also owns the date, the
        // scope and the phase row — but the rule does not get to be different
        // just because the caller is a sibling. The gate above already refused
        // anything that is not parked, and this keeps a job parked mid-flight
        // (ClemTenn's shape: `on_hold` true, status 'assigned') on the status it
        // earned instead of shunting it back a step.
        ...(String(job.status) === 'on_hold'
          ? {
              status: job.assigned_to || job.helper_assigned_to ? 'assigned' : 'scheduled',
            }
          : {}),
        updated_at: nowIso,
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (jobErr) {
      console.error('[restart] job_orders update failed:', jobErr);
      return NextResponse.json(
        {
          error:
            'The new phase was recorded but the job could not be rescheduled. Please try again.',
        },
        { status: 500 }
      );
    }

    // ── Audit (fire-and-forget, like every other history write here) ────────
    // 'restarted' is added to the job_orders_history change_type CHECK by the
    // same migration. Without that, this insert is rejected SILENTLY and the
    // restart leaves no trace — the exact failure that hid seven change types
    // before Aug 6.
    Promise.resolve(
      supabaseAdmin.from('job_orders_history').insert({
        job_order_id: id,
        job_number: job.job_number,
        changed_by: auth.userId,
        changed_by_role: auth.role,
        change_type: 'restarted',
        changes: {
          phase_number: plan.newPhaseNumber,
          scheduled_date: scheduledDate,
          end_date: endDate,
          previous_scope: job.description ?? null,
          new_scope: scopeText,
          was_parked: wasParked,
          parked_on: parkedOn,
          // Kept here even when `on_hold_reason` won the pause label above, so
          // the office's words survive either way.
          restart_note: restartNote || null,
          pause_reason: pauseReason,
        },
        notes: `Restarted as phase ${plan.newPhaseNumber} on ${scheduledDate} with a new scope.${
          restartNote ? ` Note: ${restartNote}` : ''
        }`,
      })
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        job_number: job.job_number,
        phase_number: plan.newPhaseNumber,
        scheduled_date: scheduledDate,
        end_date: endDate,
      },
    });
  } catch (e) {
    console.error('[restart] unexpected failure:', e);
    return NextResponse.json({ error: 'Failed to restart job' }, { status: 500 });
  }
}
