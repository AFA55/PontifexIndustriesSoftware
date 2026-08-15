export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCardPermission, type PermissionLevel } from '@/lib/rbac';
import { dispatchJobsForTenant } from '@/lib/dispatch';

/**
 * POST /api/admin/schedule-board/dispatch
 * Push job tickets for a target date. The dispatch logic lives in lib/dispatch.ts
 * (shared with the 7:05am auto-dispatch cron); this route adds the human
 * permission gate. dispatched_at guards against duplicate texts if a human push
 * and the auto-dispatch overlap.
 *
 * Body: { target_date: 'YYYY-MM-DD' }
 */
export async function POST(request: NextRequest) {
  const auth = await requireScheduleBoardAccess(request);
  if (!auth.authorized) return auth.response;

  // Only users with full schedule_board access can dispatch.
  if (!['super_admin', 'operations_manager', 'admin'].includes(auth.role)) {
    const { data: permRows } = await supabaseAdmin
      .from('user_card_permissions')
      .select('card_key, permission_level')
      .eq('user_id', auth.userId);

    const userPermissions: Record<string, PermissionLevel> | null =
      permRows && permRows.length > 0
        ? permRows.reduce((acc, r) => { acc[r.card_key] = r.permission_level as PermissionLevel; return acc; }, {} as Record<string, PermissionLevel>)
        : null;

    const effectiveLevel = getCardPermission(userPermissions, 'schedule_board', auth.role);
    if (effectiveLevel !== 'full') {
      return NextResponse.json(
        { error: 'Forbidden. Full schedule board access required to dispatch jobs.' },
        { status: 403 }
      );
    }
  }

  try {
    const body = await request.json();
    const targetDate = body.target_date;

    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return NextResponse.json(
        { error: 'target_date is required (YYYY-MM-DD format).' },
        { status: 400 }
      );
    }
    if (!auth.tenantId) {
      return NextResponse.json({ error: 'Tenant scope required to dispatch.' }, { status: 403 });
    }

    const result = await dispatchJobsForTenant(auth.tenantId, targetDate);

    const formattedDate = new Date(targetDate + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    const messageParts = [`Dispatched ${result.dispatched_count} job(s) for ${formattedDate}.`];
    if (result.already_dispatched_count > 0) {
      messageParts.push(`${result.already_dispatched_count} already dispatched (skipped to avoid duplicate texts).`);
    }
    if (result.dispatched_count > 0) {
      messageParts.push(`${result.notification_count} notification(s) sent.`);
    }

    return NextResponse.json({ success: true, ...result, message: messageParts.join(' ') });
  } catch (error) {
    console.error('Dispatch error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

/**
 * GET /api/admin/schedule-board/dispatch?date=YYYY-MM-DD
 * Returns the count of assigned jobs active on the given date (+ operator names
 * and any AR warnings) to populate the "Push Tickets (N)" button/modal.
 */
export async function GET(request: NextRequest) {
  const auth = await requireScheduleBoardAccess(request);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const targetDate = searchParams.get('date');

  if (!targetDate) {
    return NextResponse.json({ error: 'date query param required.' }, { status: 400 });
  }
  if (!auth.tenantId) {
    return NextResponse.json({ error: 'Tenant scope required.' }, { status: 403 });
  }

  try {
    // THE MODAL MUST LIST WHAT DISPATCH WILL ACTUALLY SEND (founder, Sat Aug 15:
    // "when I click dispatch it doesn't even show the job that is on there, it
    // shows a different job"). This required a job-level `assigned_to`, so
    // Javier's Simpsonville job — crewed entirely through the per-day board,
    // both job-level slots null — was invisible, while three multi-day jobs
    // spanning Saturday with nobody placed on it were listed instead.
    //
    // Mirrors lib/dispatch.ts: the per-day ledger is read first and unioned in,
    // so the count on the button and the jobs in the modal are the same set the
    // POST will dispatch.
    const { data: ledgerToday } = await supabaseAdmin
      .from('job_daily_assignments')
      .select('job_order_id, operator_id, helper_id')
      .eq('assignment_date', targetDate)
      .or('operator_id.not.is.null,helper_id.not.is.null');
    const ledgerRows = (ledgerToday as Array<{
      job_order_id: string; operator_id: string | null; helper_id: string | null;
    }>) ?? [];
    const ledgerJobIds = [...new Set(ledgerRows.map((r) => r.job_order_id).filter(Boolean))];
    const dayLeadByJob = new Map(
      ledgerRows.filter((r) => r.operator_id).map((r) => [r.job_order_id, r.operator_id as string])
    );

    const COLS =
      'id, job_number, customer_name, scheduled_date, end_date, arrival_time, assigned_to, helper_assigned_to, dispatched_at';
    const ACTIVE = ['scheduled', 'assigned', 'in_route', 'in_progress'];

    const [{ data: slotJobs, error }, { data: ledgerJobs }] = await Promise.all([
      supabaseAdmin
        .from('job_orders')
        .select(COLS)
        .eq('tenant_id', auth.tenantId)
        .not('assigned_to', 'is', null)
        .is('deleted_at', null)
        .lte('scheduled_date', targetDate)
        .or(`scheduled_date.eq.${targetDate},end_date.gte.${targetDate}`)
        .in('status', ACTIVE),
      ledgerJobIds.length
        ? supabaseAdmin
            .from('job_orders')
            .select(COLS)
            .eq('tenant_id', auth.tenantId)
            .in('id', ledgerJobIds)
            .is('deleted_at', null)
            .in('status', ACTIVE)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    if (error) {
      return NextResponse.json({ error: 'Failed to check dispatch status.' }, { status: 500 });
    }

    const byId = new Map<string, any>();
    for (const j of ((slotJobs as any[]) ?? [])) byId.set(j.id, j);
    for (const j of ((ledgerJobs as any[]) ?? [])) if (!byId.has(j.id)) byId.set(j.id, j);
    const allActive = Array.from(byId.values());

    // ── ONLY LIST WHAT PUSHING WILL ACTUALLY SEND (founder, Sat Aug 15) ──────
    //
    // "It still shows Pratt tickets that aren't scheduled for Saturday."
    //
    // Pratt (Aug 10-17) and Parkk 160762 (Aug 13-15) both span Saturday, so
    // they were listed — but both were DISPATCHED ON AUG 10 and `dispatched_at`
    // is written once, NULL → now, and never cleared. Pushing again does
    // nothing for them: lib/dispatch.ts skips any job that already has the
    // stamp, precisely so a crew is not texted the same ticket twice. The modal
    // was promising to dispatch three jobs when it would dispatch one.
    //
    // This is a FACT, not a policy — it needs no rule about weekends or about
    // whether a crew was placed. A dispatched job is done being dispatched.
    // It also disposes of the worry I had about excluding spanning jobs: AM
    // King went out on Aug 12, its first day, so it would still have reached
    // Dante on the 13th. A multi-day job is dispatched once, on day one.
    // A CREW CHANGE ON AN ALREADY-DISPATCHED JOB IS STILL SOMETHING TO PUSH
    // (founder, Aug 15): "I added a helper to Demo Operator and it didn't let me
    // push — it says nothing to push, but I made a change and it needs to update
    // their schedules."
    //
    // Filtering to undispatched jobs was right for the complaint it fixed —
    // Pratt was listed on Saturday having gone out five days earlier — but it
    // took the crew-change case with it. The person who was just ADDED has never
    // been told anything: the dispatch latch fired before they were on the job.
    //
    // "Changed" = today's ledger names someone the job-level slot does not.
    // That is the same comparison lib/dispatch.ts makes before it notifies, so
    // the modal and the push cannot disagree about what is pending.
    const crewChanged = (j: any) => {
      const row = ledgerRows.find((r) => r.job_order_id === j.id);
      if (!row) return false;
      const opDiffers = !!row.operator_id && row.operator_id !== j.assigned_to;
      const helperDiffers = (row.helper_id ?? null) !== (j.helper_assigned_to ?? null);
      return opDiffers || helperDiffers;
    };

    const jobList = allActive.filter((j) => !j.dispatched_at || crewChanged(j));
    const alreadyDispatched = allActive.length - jobList.length;
    const total = jobList.length;

    // Today's lead wins over the job-level slot for the NAME shown — that is
    // who the ticket is going to.
    const opIds = [
      ...new Set(
        jobList
          .map((j: any) => dayLeadByJob.get(j.id) ?? j.assigned_to)
          .filter(Boolean)
      ),
    ];
    const { data: ops } = opIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', opIds)
      : { data: [] as { id: string; full_name: string }[] };
    const opName = new Map((ops ?? []).map((p: any) => [p.id, p.full_name]));

    const customerNames = [...new Set(jobList.map((j) => j.customer_name).filter(Boolean))];
    let arWarnings: { customer_name: string; balance_due: number; days_overdue: number }[] = [];

    if (customerNames.length > 0) {
      const { data: overdueInvoices } = await supabaseAdmin
        .from('invoices')
        .select('customer_name, balance_due, due_date')
        .eq('tenant_id', auth.tenantId)
        .in('customer_name', customerNames)
        .in('status', ['overdue', 'sent'])
        .gt('balance_due', 0);

      if (overdueInvoices && overdueInvoices.length > 0) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const warningMap = new Map<string, { balance_due: number; days_overdue: number }>();

        for (const inv of overdueInvoices) {
          const dueDate = inv.due_date ? new Date(inv.due_date) : null;
          const daysOverdue = dueDate
            ? Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
            : 0;
          const existing = warningMap.get(inv.customer_name);
          if (!existing) {
            warningMap.set(inv.customer_name, { balance_due: Number(inv.balance_due), days_overdue: daysOverdue });
          } else {
            warningMap.set(inv.customer_name, {
              balance_due: existing.balance_due + Number(inv.balance_due),
              days_overdue: Math.max(existing.days_overdue, daysOverdue),
            });
          }
        }
        arWarnings = Array.from(warningMap.entries()).map(([customer_name, data]) => ({ customer_name, ...data }));
      }
    }

    return NextResponse.json({
      success: true,
      date: targetDate,
      total,
      // These were hardcoded 0 / total, so the modal could never tell the
      // office that a job had already gone out. Real numbers now.
      dispatched: alreadyDispatched,
      undispatched: total,
      ar_warnings: arWarnings,
      jobs: jobList.map((j: any) => ({
        id: j.id,
        job_number: j.job_number,
        customer_name: j.customer_name,
        scheduled_date: j.scheduled_date,
        end_date: j.end_date,
        arrival_time: j.arrival_time,
        // The person the ticket is actually going to today — the day's ledger
        // lead first, the job-level slot only as a fallback.
        operator_name: opName.get(dayLeadByJob.get(j.id) ?? j.assigned_to) ?? 'Unassigned',
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
