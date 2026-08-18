export const dynamic = 'force-dynamic';

/**
 * API Route: PATCH /api/admin/job-orders/[id]
 * Update a job order (admin only)
 *
 * API Route: DELETE /api/admin/job-orders/[id]
 * Delete a job order (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { sendNotification } from '@/lib/send-reminder';
import { shouldClearCrewOnDateMove, summarizeCrewChange, describeCrewClear } from '@/lib/crew-assignment';

/**
 * Numeric fields that must be coerced to a number-or-null. A cleared field
 * arrives as '' (JobDetailView) or null (EditJobPanel); writing '' to a numeric
 * column throws and silently fails the whole save — that was the "lets me edit
 * but doesn't save" bug on the cost field. '' / NaN / negative → null.
 */
const NON_NEGATIVE_NUMERIC_FIELDS = [
  'drive_distance_miles', 'mileage_rate', 'equipment_cost', 'material_cost', 'other_cost', 'subcontractor_cost',
  'estimated_cost', 'estimated_hours',
];
function nonNegativeNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params as required by Next.js 15+
    const { id } = await params;

    // Get user from Supabase session (server-side)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Get user's role and name from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, full_name, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user role' },
        { status: 403 }
      );
    }

    // Parse request body (needed by the permission check below).
    const updates = await request.json();

    // ── WHO MAY EDIT A JOB, AND WHO MAY ONLY PUSH ONE ──────────────────────
    // FOUNDER (Aug 13): "Give permission to Adam Ingalls and David Schadt so
    // they could push jobs if I'm not here."
    //
    // The first attempt at this widened the dedicated /approve endpoint — which
    // NOTHING CALLS. The board's Approve button PATCHes this route, whose own
    // list already admitted `supervisor` (so David could always push) and still
    // excluded `salesman`, so Adam stayed blocked by the very button being
    // complained about. Caught in review: I verified the guard I edited and not
    // the call path.
    //
    // Fixed here, narrowly. A salesman may push a job onto the schedule and
    // nothing else: the payload must touch only approval fields. Adding
    // `salesman` to the editor list outright would have handed them every job
    // field — cost, scope, crew, status of a live job — to fix one button.
    const APPROVAL_ONLY_FIELDS = new Set([
      'status',
      'scheduled_date',
      'end_date',
      'is_will_call',
      'arrival_time',
    ]);
    const APPROVAL_STATUSES = new Set(['scheduled', 'assigned', 'pending_approval']);
    const isApprovalOnlyUpdate =
      Object.keys(updates).length > 0 &&
      Object.keys(updates).every((k) => APPROVAL_ONLY_FIELDS.has(k)) &&
      (!('status' in updates) || APPROVAL_STATUSES.has(String(updates.status)));

    const canEditJobs = ['admin', 'super_admin', 'operations_manager', 'supervisor'].includes(profile.role);
    const canPushJobs = profile.role === 'salesman' && isApprovalOnlyUpdate;

    if (!canEditJobs && !canPushJobs) {
      return NextResponse.json(
        {
          error:
            profile.role === 'salesman'
              ? 'You can approve and schedule jobs, but not edit their details.'
              : 'Only administrators can update job orders',
        },
        { status: 403 }
      );
    }

    console.log(`Updating job order ${id} with:`, updates);

    // Resolve tenant scope — supabaseAdmin bypasses RLS, must scope manually
    const tenantId = await getTenantId(user.id);
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    // Get the current job order before updating (for audit trail)
    let oldJobQuery = supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', id);
    oldJobQuery = oldJobQuery.eq('tenant_id', tenantId);
    const { data: oldJobOrder, error: fetchError } = await oldJobQuery.single();

    if (fetchError || !oldJobOrder) {
      return NextResponse.json(
        { error: 'Job order not found' },
        { status: 404 }
      );
    }

    // The salesman gate above constrains what the payload may set the status
    // TO. It could not constrain what the job IS, because the job had not been
    // read yet — so a salesman could PATCH an in_progress or completed job back
    // to 'scheduled'. Worse, moving the start also clears the crew, so that one
    // call would have silently unassigned the operator and helper from a job
    // being worked in the field. Now that the row is in hand, check it.
    const PUSHABLE_FROM = new Set(['pending_approval', 'scheduled', 'assigned']);
    if (canPushJobs && !canEditJobs && !PUSHABLE_FROM.has(String(oldJobOrder.status))) {
      return NextResponse.json(
        {
          error: `This job is already ${oldJobOrder.status?.replace(/_/g, ' ')} — it can no longer be scheduled from here.`,
        },
        { status: 403 }
      );
    }

    // Build update object - only include fields that were actually sent
    const updateFields: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    const allowedFields = [
      'arrival_time', 'shop_arrival_time', 'location', 'address',
      'customer_name', 'foreman_name', 'foreman_phone', 'equipment_needed',
      'description', 'assigned_to', 'helper_assigned_to', 'scheduled_date', 'end_date',
      // Working-day duration — the fact end_date is derived FROM. Without it on
      // this list a long job's length silently reverted on every edit.
      'duration_working_days',
      // NOTE: `operator_name` is deliberately ABSENT. There is no such column on
      // job_orders (information_schema, Aug 18) — it lives on
      // job_daily_assignments / schedule_board_view. While it sat on this list a
      // client that sent it would have put a non-existent column into the UPDATE
      // and hard-failed the whole save with "column does not exist". Nothing
      // sends it today; it was a loaded gun.
      'estimated_hours', 'estimated_cost', 'status', 'priority',
      'is_will_call', 'difficulty_rating',
      'ppe_required', 'additional_safety_requirements',
      // Direct column names that the schedule-form + schedule-board edit panels
      // send and previously had silently dropped on save.
      'po_number', 'customer_id', 'customer_contact', 'site_contact_phone',
      // More columns the full-job editor sends that were being dropped on save
      // (the "edits don't stick" bug): project name, job type, scope photos,
      // and the project-manager owner.
      'project_name', 'job_type', 'scope_photo_urls', 'project_manager_id',
      // Who quoted/submitted the job. The CREATE route maps the schedule form's
      // `submitted_by` onto this column, but it was missing here — so an edit
      // could never set or correct it, and a job created any other way stayed
      // null forever. That null is what printed "Quoted By: —" on the job
      // ticket while the form showed a name (the form auto-fills the box with
      // the current user, which is not the same thing as a stored value).
      'salesman_name',
      // Optional job financials (opt-in via track_financials) — schema-only
      // until this route's PATCH wired them through.
      'track_financials', 'drive_distance_miles', 'mileage_rate',
      'equipment_cost', 'material_cost', 'other_cost', 'subcontractor_cost',
      // Step 6 columns the schedule-form editor renders but could not save.
      // All four verified present + updatable on public.job_orders (prod, Aug
      // 2026). `permits` is jsonb and goes through jsonbPassthrough below.
      'permit_required', 'require_waiver_signature', 'require_completion_signature',
      'facility_id',
    ];

    allowedFields.forEach(field => {
      if (field in updates) {
        updateFields[field] = NON_NEGATIVE_NUMERIC_FIELDS.includes(field)
          ? nonNegativeNumberOrNull(updates[field])
          : updates[field];
      }
    });

    // Schedule-form edit payload → job_orders columns. The form sends JSONB +
    // relational fields the basic allowlist omits, and uses different keys than
    // the columns for three of them. Map them explicitly so editing a job no
    // longer silently drops scope / scheduling / compliance / conditions /
    // equipment selections / customer link / contact / location on re-save.
    const jsonbPassthrough = [
      'scope_details',
      'scheduling_flexibility',
      'site_compliance',
      'jobsite_conditions',
      'equipment_selections',
      'equipment_rental_flags',
      'permits',
    ];
    for (const f of jsonbPassthrough) {
      if (f in updates) updateFields[f] = updates[f];
    }
    // The full-job editor's "Additional Notes" maps onto the additional_info column.
    if ('additional_notes' in updates) updateFields.additional_info = updates.additional_notes;
    // Keep the two difficulty columns in sync — legacy readers use
    // job_difficulty_rating; the editor + summary use difficulty_rating.
    if ('difficulty_rating' in updates) updateFields.job_difficulty_rating = updates.difficulty_rating;
    if ('location_name' in updates) updateFields.location = updates.location_name;
    if ('site_address' in updates) updateFields.address = updates.site_address;
    if ('site_contact' in updates) updateFields.customer_contact = updates.site_contact;
    if ('contact_phone' in updates) {
      updateFields.site_contact_phone = updates.contact_phone;
      updateFields.foreman_phone = updates.contact_phone; // keep legacy column in sync (matches create route)
    }

    // ── MOVING A JOB TO A NEW DATE ─────────────────────────────────────────
    // Two things must happen that were not happening, both found on
    // JOB-2026-160762 (Parkk, 214 Industrial Park Drive) on Aug 13.
    //
    // 1. THE SPAN MOVES WITH THE START, OR THE JOB DISAPPEARS.
    //    That job ran Aug 10–12. Its start was pushed to Aug 13 and `end_date`
    //    was left on Aug 12 — ending the day BEFORE it began. Every board query
    //    asks "starts on or before D and ends on or after D", which an inverted
    //    span can never satisfy, so the job vanished from the schedule board on
    //    EVERY date while still showing in Active Jobs as scheduled. Nothing
    //    errored; it was simply gone. Two more jobs are in that state today.
    //
    //    So when the start moves and the caller did not say where the end goes,
    //    shift the end by the same number of days and keep the duration.
    //
    // 2. THE CREW COMES OFF (founder, Aug 13: "it looks like it assigned Keon
    //    right away to it — I want it to show in unassigned for next time").
    //    Whoever was free on Monday is not necessarily free on Thursday, and a
    //    silently-carried operator means nobody re-checks. Same principle as
    //    per-day assignment: being on a job one day does not put you on it the
    //    next. A caller that explicitly sets `assigned_to` in the same request
    //    is obeyed — this only clears a crew nobody restated.
    const movingStart =
      'scheduled_date' in updateFields &&
      updateFields.scheduled_date &&
      updateFields.scheduled_date !== oldJobOrder.scheduled_date;

    // Set only when the date move ACTUALLY took a crew off — the per-day ledger
    // cleanup below keys off this, not off `movingStart`, or a live job whose
    // crew we just protected would lose them again by the back door.
    let crewClearedByDateMove = false;

    if (movingStart) {
      const oldStart = oldJobOrder.scheduled_date as string | null;
      const oldEnd = (oldJobOrder.end_date as string | null) || oldStart;

      if (!('end_date' in updateFields) && oldStart && oldEnd) {
        const dayMs = 24 * 60 * 60 * 1000;
        const spanDays = Math.round(
          (new Date(`${oldEnd}T00:00:00`).getTime() - new Date(`${oldStart}T00:00:00`).getTime()) / dayMs
        );
        if (spanDays > 0) {
          const newEnd = new Date(`${updateFields.scheduled_date}T00:00:00`);
          newEnd.setDate(newEnd.getDate() + spanDays);
          updateFields.end_date = `${newEnd.getFullYear()}-${String(newEnd.getMonth() + 1).padStart(2, '0')}-${String(newEnd.getDate()).padStart(2, '0')}`;
        } else {
          // Single-day job: the end follows the start exactly.
          updateFields.end_date = updateFields.scheduled_date;
        }
      }

      // …BUT NOT OFF A JOB SOMEONE IS STANDING ON (Aug 18).
      //
      // The rule above describes a job nobody has started: whoever was free on
      // Monday is not necessarily free on Thursday. It stops describing a job
      // that is `in_route` or being worked, where a date edit is nearly always
      // a correction — fixing an end date, nudging a span — and the crew on it
      // is a fact about right now, not a guess about a future day. Two of the
      // three jobs stripped on Aug 18 were `in_route`, with crews driving to
      // jobs the board then said nobody was on.
      //
      // Deliberately NOT gated on `dispatched_at`: a dispatched-but-unstarted
      // job that moves to next week SHOULD go back to the pool for re-picking.
      // It is being STARTED that makes the crew a fact.
      const { data: loggedWork } = await supabaseAdmin
        .from('daily_job_logs')
        .select('id')
        .eq('job_order_id', id)
        .eq('tenant_id', tenantId)
        .limit(1);

      const mayClearCrew = shouldClearCrewOnDateMove({
        status: oldJobOrder.status as string | null,
        hasWorkLogged: !!(loggedWork && loggedWork.length > 0),
      });

      if (mayClearCrew) {
        if (!('assigned_to' in updateFields)) {
          updateFields.assigned_to = null;
          if (oldJobOrder.assigned_to) crewClearedByDateMove = true;
        }
        if (!('helper_assigned_to' in updateFields)) {
          updateFields.helper_assigned_to = null;
          if (oldJobOrder.helper_assigned_to) crewClearedByDateMove = true;
        }
      } else if (oldJobOrder.assigned_to || oldJobOrder.helper_assigned_to) {
        console.log(
          `[job-update] ${id} is ${oldJobOrder.status} with a crew on it — date move kept the crew instead of clearing it`
        );
      }
    }

    // ── LAST LINE OF DEFENCE: a job may never end before it starts ──────────
    // The shift above is skipped when the caller supplies `end_date` — and the
    // schedule form ALWAYS supplies it, echoing back whatever was loaded. So an
    // admin who opens a job (Aug 10 → Aug 12), moves Start to Aug 13 and does
    // not touch End posts {scheduled_date: 8/13, end_date: 8/12} and recreates
    // the exact inversion that made JOB-2026-160762 vanish from every board
    // date. Nothing validates it client-side either: the End picker's minDate
    // only disables cells, it never clears a value already set.
    //
    // An inverted span is never a legitimate state, so it is corrected here
    // rather than trusted, whatever the caller sent and whichever path it came
    // from. Preserve the job's ORIGINAL duration when we know it; otherwise
    // collapse to a single day.
    // `??` falls through on an explicit null as well as an absent key, and the
    // schedule form sends `end_date: form.end_date || null`. So clearing End
    // while moving Start made the corrector read the OLD end, decide the span
    // was inverted, and write back a multi-day job the admin never asked for:
    // Aug 10–12 moved to Aug 20 with End cleared became Aug 20–22. Test for the
    // KEY, not for a value.
    const finalStart = ('scheduled_date' in updateFields
      ? updateFields.scheduled_date
      : oldJobOrder.scheduled_date) as string | null;
    const finalEnd = ('end_date' in updateFields
      ? updateFields.end_date
      : oldJobOrder.end_date) as string | null;
    if (finalStart && finalEnd && finalEnd < finalStart) {
      const dayMs = 24 * 60 * 60 * 1000;
      const prevStart = oldJobOrder.scheduled_date as string | null;
      const prevEnd = oldJobOrder.end_date as string | null;
      let span = 0;
      if (prevStart && prevEnd && prevEnd >= prevStart) {
        span = Math.round(
          (new Date(`${prevEnd}T00:00:00`).getTime() - new Date(`${prevStart}T00:00:00`).getTime()) / dayMs
        );
      }
      const corrected = new Date(`${finalStart}T00:00:00`);
      corrected.setDate(corrected.getDate() + span);
      updateFields.end_date = `${corrected.getFullYear()}-${String(corrected.getMonth() + 1).padStart(2, '0')}-${String(corrected.getDate()).padStart(2, '0')}`;
      console.warn(
        `[job-update] corrected inverted span on ${id}: end ${finalEnd} was before start ${finalStart} → ${updateFields.end_date}`
      );
    }

    // Update job order (scoped to tenant)
    let updateQuery = supabaseAdmin
      .from('job_orders')
      .update(updateFields)
      .eq('id', id);
    updateQuery = updateQuery.eq('tenant_id', tenantId);
    const { data: jobOrder, error: updateError } = await updateQuery.select().single();

    console.log('Update result:', { jobOrder, updateError });

    if (!updateError && jobOrder) {
      // ── Per-day ledger cleanup on a DATE MOVE (guardian B4) ───────────────
      // When scheduled_date/end_date change, this job's job_daily_assignments
      // rows for dates now OUTSIDE the new window are stale: they'd keep
      // blocking the old day's sequence gate and ghost the board overlay.
      // Delete out-of-window rows; in-window rows (who runs which day) stay.
      // Scope: job id (tenant-verified above) + tenant_id match-or-NULL so
      // legacy NULL-tenant rows are cleaned too.
      const dateChanged =
        ('scheduled_date' in updates && jobOrder.scheduled_date !== oldJobOrder.scheduled_date) ||
        ('end_date' in updates && jobOrder.end_date !== oldJobOrder.end_date);
      if (dateChanged && jobOrder.scheduled_date) {
        const windowStart = jobOrder.scheduled_date;
        const windowEnd = jobOrder.end_date || jobOrder.scheduled_date;
        let cleanup = supabaseAdmin
          .from('job_daily_assignments')
          .delete()
          .eq('job_order_id', id)
          .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
        // When the date move DROPPED THE CREW, every ledger row describes the
        // old schedule — including any that happens to fall inside the new
        // window, which would quietly put the old operator back on the job the
        // founder just asked to see unassigned. Clear them all.
        //
        // Keyed on the crew actually having been cleared, NOT on `movingStart`:
        // a live job whose crew we deliberately kept must keep its ledger rows
        // too, or the protection above is undone one query later.
        if (!crewClearedByDateMove) {
          cleanup = cleanup.or(`assignment_date.lt.${windowStart},assignment_date.gt.${windowEnd}`);
        }
        const { error: ledgerCleanupError } = await cleanup;
        if (ledgerCleanupError) {
          // Non-fatal: the sequence gate also filters stale rows by window.
          console.error('Failed to clean stale per-day assignments after date move:', ledgerCleanupError);
        }
      }

      // Create audit trail entry - track what changed
      const changes: Record<string, { old: any; new: any }> = {};

      // Compare old vs new values
      const fieldsToTrack = [
        'arrival_time',
        'shop_arrival_time',
        'location',
        'address',
        'customer_name',
        'foreman_name',
        'foreman_phone',
        'equipment_needed',
        'description',
        'assigned_to',
        'scheduled_date',
        'end_date',
        'estimated_hours',
        // 'operator_name' removed — not a job_orders column (see allowedFields).
        'status',
        'priority',
      ];

      fieldsToTrack.forEach(field => {
        const oldValue = oldJobOrder[field];
        const newValue = updates[field];

        // Check if value actually changed
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes[field] = {
            old: oldValue,
            new: newValue
          };
        }
      });

      // Only log if something actually changed — gracefully handle missing history table
      if (Object.keys(changes).length > 0) {
        const { error: historyError } = await supabaseAdmin
          .from('job_orders_history')
          .insert({
            job_order_id: id,
            job_number: jobOrder.job_number,
            changed_by: user.id,
            changed_by_name: profile.full_name || user.email,
            changed_by_role: profile.role,
            change_type: 'updated',
            changes: changes,
            snapshot: jobOrder, // Store complete snapshot
          });

        if (historyError) {
          // If table doesn't exist yet, don't block the update
          if (isTableNotFoundError(historyError)) {
            console.log('Audit trail skipped: history table not available yet');
          } else {
            console.error('Error logging audit trail:', historyError);
          }
        } else {
          console.log('Audit trail logged:', Object.keys(changes));
        }

        // CHANGE-LOG NOTES ARE NO LONGER WRITTEN (founder, Aug 15).
        //
        // Every edit used to drop a `change_log` row into `job_notes`. Two
        // problems, one visible and one not:
        //
        //   • VISIBLE: the notes badge counted every row in job_notes while the
        //     panel showed only human ones. Simpsonville read "2" over "No notes
        //     yet" — the two were a status flip and a door code being added.
        //     A badge that disagrees with the thing it counts trains people to
        //     ignore badges.
        //   • The founder weighed the audit trail and decided against it:
        //     "would just add more storage for us than anything." The Changes
        //     button that surfaced it had no onClick and never opened anything,
        //     so nobody was reading these.
        //
        // The real audit trail (`job_history`, written just above) is untouched
        // — that is the one with a purpose.

        // Notify the newly-assigned operator across their enabled channels
        // (in-app bell + push + email, per their notification_preferences) —
        // only when the assignment actually changed (a genuine dispatch).
        // Fire-and-forget: never blocks or alters the API response.
        if ('assigned_to' in changes && jobOrder.assigned_to) {
          sendNotification({
            userId: jobOrder.assigned_to,
            tenantId: jobOrder.tenant_id ?? null,
            category: 'job_dispatched',
            title: 'New job assigned 📋',
            message: `${jobOrder.job_number || 'A job'} for ${jobOrder.customer_name || 'a customer'} has been assigned to you.`,
            inAppType: 'job_order',
            jobOrderId: jobOrder.id,
            actionUrl: '/dashboard/my-jobs',
          }).catch(() => {});
        }
      }
    }

    if (updateError) {
      console.error('Error updating job order:', updateError);
      return NextResponse.json(
        { error: 'Failed to update job order' },
        { status: 500 }
      );
    }

    // ── SAY IT OUT LOUD IF A CREW CAME OFF ──────────────────────────────────
    // The office pressed a button and three jobs quietly lost their operator;
    // nothing in the response said so, so nothing in the UI could either.
    // Whatever the rule ends up being, the answer has to name what it did.
    const crewChange = summarizeCrewChange(
      {
        operatorId: (oldJobOrder.assigned_to as string | null) ?? null,
        helperId: (oldJobOrder.helper_assigned_to as string | null) ?? null,
      },
      {
        operatorId: (jobOrder?.assigned_to as string | null) ?? null,
        helperId: (jobOrder?.helper_assigned_to as string | null) ?? null,
      }
    );
    // NAME THE PERSON WHO CAME OFF. This read `oldJobOrder.operator_name`, and
    // `job_orders` HAS NO SUCH COLUMN (checked against information_schema, Aug
    // 18 — operator_name lives on job_daily_assignments and schedule_board_view).
    // `select('*')` therefore handed back `undefined` every time and the notice
    // always degraded to the generic "the operator was taken off this job",
    // which is exactly the sentence that needed to carry a name. Resolve it
    // from the ids we actually cleared.
    let clearedOperatorName: string | null = null;
    let clearedHelperName: string | null = null;
    const clearedOperatorId = crewChange.operator_cleared
      ? ((oldJobOrder.assigned_to as string | null) ?? null)
      : null;
    const clearedHelperId = crewChange.helper_cleared
      ? ((oldJobOrder.helper_assigned_to as string | null) ?? null)
      : null;
    if (clearedOperatorId || clearedHelperId) {
      const ids = [clearedOperatorId, clearedHelperId].filter(Boolean) as string[];
      const { data: people } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', ids);
      const byId = new Map(
        ((people || []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name])
      );
      clearedOperatorName = clearedOperatorId ? (byId.get(clearedOperatorId) ?? null) : null;
      clearedHelperName = clearedHelperId ? (byId.get(clearedHelperId) ?? null) : null;
    }
    const crewNotice = describeCrewClear(crewChange, {
      operator: clearedOperatorName,
      helper: clearedHelperName,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Job order updated successfully',
        ...(crewNotice ? { notice: crewNotice } : {}),
        crew_change: crewChange,
        data: jobOrder,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in update job order route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params as required by Next.js 15+
    const { id } = await params;

    // Get user from Supabase session (server-side)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Get user's role and name from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, full_name, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user role' },
        { status: 403 }
      );
    }

    // Check if user is admin or super_admin
    if (!['admin', 'super_admin', 'operations_manager', 'supervisor'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only administrators can delete job orders' },
        { status: 403 }
      );
    }

    // Resolve tenant scope — supabaseAdmin bypasses RLS, must scope manually
    const tenantIdDel = await getTenantId(user.id);

    // Get the job order before deleting (for audit trail), scoped to tenant
    let fetchQuery = supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', id);
    if (tenantIdDel) fetchQuery = fetchQuery.eq('tenant_id', tenantIdDel);
    const { data: jobOrder, error: fetchError } = await fetchQuery.single();

    if (fetchError || !jobOrder) {
      return NextResponse.json(
        { error: 'Job order not found' },
        { status: 404 }
      );
    }

    // ── Step 1: Notify assigned operator(s) BEFORE deletion ─────────────────
    const assignedUserIds: string[] = [];
    if (jobOrder.assigned_to) assignedUserIds.push(jobOrder.assigned_to);
    if (jobOrder.helper_assigned_to) assignedUserIds.push(jobOrder.helper_assigned_to);

    if (assignedUserIds.length > 0) {
      const cancellationNotifications = assignedUserIds.map(userId => ({
        user_id: userId,
        tenant_id: tenantIdDel || jobOrder.tenant_id,
        type: 'job_cancelled',
        notification_type: 'job_cancelled',
        title: 'Job Cancelled',
        message: `${jobOrder.job_number} for ${jobOrder.customer_name || 'customer'} has been removed from the schedule.`,
        job_id: id,
        related_entity_type: 'job_order',
        related_entity_id: id,
        read: false,
        is_read: false,
        priority: 'high',
        created_at: new Date().toISOString(),
      }));
      Promise.resolve(
        supabaseAdmin.from('notifications').insert(cancellationNotifications)
      ).catch(() => {});
    }

    // ── Step 2: Audit trail (before deletion so FK is still valid) ───────────
    Promise.resolve(
      supabaseAdmin.from('job_orders_history').insert({
        job_order_id: id,
        job_number: jobOrder.job_number,
        changed_by: user.id,
        changed_by_name: profile.full_name || user.email,
        changed_by_role: profile.role,
        change_type: 'deleted',
        changes: { deleted: { old: jobOrder, new: null } },
        snapshot: jobOrder,
      })
    ).catch(() => {});

    // ── Step 3: Clean up NO ACTION FK tables before hard delete ─────────────
    // These tables have NO ACTION FK and would block or orphan if not cleaned

    // 3a. Invoice line items — remove association (preserve invoice record)
    await supabaseAdmin
      .from('invoice_line_items')
      .delete()
      .eq('job_order_id', id);

    // 3b. Timecards — preserve payroll records, just unlink from this job
    await supabaseAdmin
      .from('timecards')
      .update({ job_order_id: null })
      .eq('job_order_id', id);

    // 3c. Pay adjustments — preserve, just unlink
    await supabaseAdmin
      .from('pay_adjustments')
      .update({ job_order_id: null })
      .eq('job_order_id', id);

    // 3d. Operator workflow log — delete (no longer relevant)
    await supabaseAdmin
      .from('operator_workflow_log')
      .delete()
      .eq('job_order_id', id);

    // 3e. Operator workflow sessions — delete
    await supabaseAdmin
      .from('operator_workflow_sessions')
      .delete()
      .eq('job_order_id', id);

    // 3f. Operator job history — delete
    await supabaseAdmin
      .from('operator_job_history')
      .delete()
      .eq('job_id', id);

    // 3g. Unlink continuation jobs (set parent_job_id to null so they still exist)
    await supabaseAdmin
      .from('job_orders')
      .update({ parent_job_id: null })
      .eq('parent_job_id', id);

    // ── Step 4: Hard delete the job order (CASCADE handles the rest) ─────────
    let deleteQuery = supabaseAdmin
      .from('job_orders')
      .delete()
      .eq('id', id);
    if (tenantIdDel) deleteQuery = deleteQuery.eq('tenant_id', tenantIdDel);
    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      console.error('Error deleting job order:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete job order' },
        { status: 500 }
      );
    }

    console.log(`Job order ${id} (${jobOrder.job_number}) deleted by ${profile.full_name}`);

    return NextResponse.json(
      {
        success: true,
        message: 'Job order deleted successfully',
        notified_operators: assignedUserIds.length,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in delete job order route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
