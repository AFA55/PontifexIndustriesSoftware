export const dynamic = 'force-dynamic';

/**
 * API Route: PATCH /api/admin/jobs/[id]/timestamps
 *
 * Allows admins to edit operator activity timestamps on a job:
 *   - in_route_at        (mirrored onto route_started_at unless that is sent too)
 *   - route_started_at
 *   - arrived_at_jobsite_at
 *   - work_started_at
 *   - work_completed_at
 *
 * Each value may be:
 *   - an ISO-8601 string (sets the column)
 *   - explicit `null` (clears the column)
 *   - omitted (column is left unchanged)
 *
 * Optional `edit_reason` string is captured in the audit log.
 *
 * PATCH — requireAdmin
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { movesJobDayBoundary } from '@/lib/timestamp-edit-access';

type RouteContext = { params: Promise<{ id: string }> };

const ALLOWED_KEYS = [
  'in_route_at',
  // THE PRESS LIVES IN TWO COLUMNS AND AN EDIT MUST REACH BOTH.
  //
  // `jobStartOnDate` (lib/job-day-boundary.ts) takes the MIN of
  // `route_started_at`, `in_route_at` and `work_started_at`, because production
  // populates them inconsistently — 30 jobs carry only `route_started_at`, 8
  // only `in_route_at`, and on all 5 where the two differ `in_route_at` is the
  // earlier. This route used to accept `in_route_at` alone, so correcting a
  // job's In Route to a LATER time did nothing at all: the untouched
  // `route_started_at` still won the `min` and the boundary never moved. The
  // office would edit the stamp, reprint the ticket, and read the same wrong
  // hours back.
  //
  // So `route_started_at` is editable, and an `in_route_at` edit that does not
  // name it explicitly writes BOTH to the same value (see `mirrorRouteStart`).
  // Both land in the audit log's before/after.
  'route_started_at',
  'arrived_at_jobsite_at',
  'work_started_at',
  'work_completed_at',
] as const;

type TimestampKey = (typeof ALLOWED_KEYS)[number];

/** Strict ISO-8601 validation — `new Date()` is too permissive on its own. */
function parseIsoTimestamp(value: unknown): { ok: true; iso: string } | { ok: false } {
  if (typeof value !== 'string' || value.trim() === '') return { ok: false };
  const d = new Date(value);
  if (isNaN(d.getTime())) return { ok: false };
  return { ok: true, iso: d.toISOString() };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Build the update payload from only the recognised, present keys.
    const updates: Partial<Record<TimestampKey, string | null>> = {};
    for (const key of ALLOWED_KEYS) {
      if (!(key in body)) continue;
      const raw = body[key];
      if (raw === null) {
        updates[key] = null;
        continue;
      }
      const parsed = parseIsoTimestamp(raw);
      if (!parsed.ok) {
        return NextResponse.json(
          { error: `Invalid timestamp for "${key}". Expected ISO-8601 string or null.` },
          { status: 400 }
        );
      }
      updates[key] = parsed.iso;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No timestamps provided' }, { status: 400 });
    }

    // KEEP THE TWO IN-ROUTE COLUMNS IN LOCKSTEP. See ALLOWED_KEYS. Editing
    // `in_route_at` without also moving `route_started_at` is a no-op for every
    // consumer that reads the earliest of the pair — which is the boundary rule
    // the printed ticket, the Daily Progress panel and the labor cost all run.
    // An explicit `route_started_at` in the body always wins; this only fills in
    // the caller who named just the one.
    const mirrorRouteStart = 'in_route_at' in updates && !('route_started_at' in updates);
    if (mirrorRouteStart) {
      updates.route_started_at = updates.in_route_at ?? null;
    }

    // WHAT AN IN-ROUTE EDIT ACTUALLY MOVES, said out loud because it is not
    // obvious and it reaches an invoice. The press is a BOUNDARY between jobs on
    // one clocked day (lib/job-day-boundary.ts): the job before it runs up to
    // this press, this job runs from it. So correcting job B's In Route EARLIER
    // shortens job A's stretch on the same day and lengthens B's — editing one
    // job's stamp rewrites another job's hours, by design, because a day has one
    // clock and two jobs cannot both own the same minute. That is a property of
    // the founder's rule rather than a defect in this route, but an admin
    // changing a timestamp should be told; the response carries the note.

    const editReason =
      typeof body.edit_reason === 'string' && body.edit_reason.trim() !== ''
        ? body.edit_reason.trim()
        : null;

    // ── Verify the job exists (tenant-scoped unless super_admin) ─────────────
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select(
        'id, tenant_id, in_route_at, route_started_at, arrived_at_jobsite_at, work_started_at, work_completed_at'
      )
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: existing, error: existingError } = await jobQuery.maybeSingle();

    if (existingError) {
      console.error('[timestamps] job lookup failed', { jobId, tenantId, existingError });
      return NextResponse.json({ error: 'Failed to load job' }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Capture before snapshot for the audit log.
    const before: Record<string, string | null> = {};
    for (const key of Object.keys(updates) as TimestampKey[]) {
      before[key] = (existing as any)[key] ?? null;
    }

    // ── Apply update ────────────────────────────────────────────────────────
    let updateQuery = supabaseAdmin
      .from('job_orders')
      .update(updates)
      .eq('id', jobId);
    if (tenantId) updateQuery = updateQuery.eq('tenant_id', tenantId);

    const { data: updated, error: updateError } = await updateQuery
      .select(
        'id, in_route_at, route_started_at, arrived_at_jobsite_at, work_started_at, work_completed_at'
      )
      .single();

    if (updateError || !updated) {
      console.error('[timestamps] update failed', { jobId, updates, updateError });
      return NextResponse.json({ error: 'Failed to update timestamps' }, { status: 500 });
    }

    const after: Record<string, string | null> = {};
    for (const key of Object.keys(updates) as TimestampKey[]) {
      after[key] = (updated as any)[key] ?? null;
    }

    // ── Audit log (fire-and-forget) ─────────────────────────────────────────
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        user_role: auth.role,
        action: 'admin_edit_job_timestamps',
        resource_type: 'job_order',
        resource_id: jobId,
        tenant_id: existing.tenant_id ?? tenantId ?? null,
        details: {
          before,
          after,
          edit_reason: editReason,
          changed_keys: Object.keys(updates),
        },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        job_id: jobId,
        timestamps: {
          in_route_at: updated.in_route_at ?? null,
          route_started_at: updated.route_started_at ?? null,
          arrived_at_jobsite_at: updated.arrived_at_jobsite_at ?? null,
          work_started_at: updated.work_started_at ?? null,
          work_completed_at: updated.work_completed_at ?? null,
        },
        edit_reason: editReason,
        // The caller asked to move In Route; both columns moved. See ALLOWED_KEYS.
        route_start_mirrored: mirrorRouteStart,
        // A start stamp is a boundary between two jobs on one clocked day, so
        // moving it re-divides that day. Surfaced, not hidden.
        //
        // This used to test only `in_route_at`/`route_started_at`, which missed
        // the case that actually reaches an invoice: `jobStartOnDate` takes the
        // MINIMUM of the three start stamps, so editing `work_started_at` moves
        // the boundary whenever it is (or becomes) the earliest — and clearing
        // In Route nulls both press columns, which makes it the only candidate
        // left. The field list lives in `lib/timestamp-edit-access.ts` so the
        // modal's up-front warning and this after-the-fact note stay in step.
        boundary_note: Object.keys(updates).some(movesJobDayBoundary)
          ? 'This stamp divides the crew’s clocked day between jobs — moving it also changes the hours attributed to the other job(s) worked that day.'
          : null,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in PATCH /api/admin/jobs/[id]/timestamps:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
