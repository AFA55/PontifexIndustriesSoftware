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
    const { data: jobs, error } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, scheduled_date, end_date, arrival_time, assigned_to')
      .eq('tenant_id', auth.tenantId)
      .not('assigned_to', 'is', null)
      .is('deleted_at', null)
      .lte('scheduled_date', targetDate)
      .or(`scheduled_date.eq.${targetDate},end_date.gte.${targetDate}`)
      .in('status', ['scheduled', 'assigned', 'in_route', 'in_progress']);

    if (error) {
      return NextResponse.json({ error: 'Failed to check dispatch status.' }, { status: 500 });
    }

    const jobList = jobs || [];
    const total = jobList.length;

    const opIds = [...new Set(jobList.map((j: any) => j.assigned_to).filter(Boolean))];
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
      dispatched: 0,
      undispatched: total,
      ar_warnings: arWarnings,
      jobs: jobList.map((j: any) => ({
        id: j.id,
        job_number: j.job_number,
        customer_name: j.customer_name,
        scheduled_date: j.scheduled_date,
        end_date: j.end_date,
        arrival_time: j.arrival_time,
        operator_name: opName.get(j.assigned_to) ?? 'Unassigned',
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
