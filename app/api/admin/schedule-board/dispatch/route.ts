export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCardPermission, type PermissionLevel } from '@/lib/rbac';
import { sendSMS } from '@/lib/sms';
import { resolveAppOrigin } from '@/lib/app-url';

/**
 * POST /api/admin/schedule-board/dispatch
 * Push job tickets for a target date — dispatches all assigned jobs
 * and sends in-app notifications to operators and helpers.
 *
 * Body: { target_date: 'YYYY-MM-DD' }
 *
 * Behavior:
 * - Notifies/texts ONLY jobs being dispatched for the first time this call (dispatched_at was NULL).
 * - Jobs that already have a dispatched_at (set on a prior call) are SKIPPED for SMS + notification
 *   insert and reported back as `already_dispatched_count` — this is the duplicate-dispatch guard
 *   that prevents repeat SMS (cost) + duplicate notifications when "Dispatch" is pressed twice or a
 *   day that was already dispatched is re-dispatched.
 * - dispatched_at is set on first-ever dispatch only (not overwritten on re-push).
 * - Multi-day jobs are included via date-range query (scheduled_date <= target AND end_date >= target).
 */
export async function POST(request: NextRequest) {
  const auth = await requireScheduleBoardAccess(request);
  if (!auth.authorized) return auth.response;

  // Only users with full schedule_board access can dispatch.
  // admin is treated as a first-class dispatcher alongside super_admin/operations_manager.
  if (!['super_admin', 'operations_manager', 'admin'].includes(auth.role)) {
    // Fetch explicit user card permissions (may be empty)
    const { data: permRows } = await supabaseAdmin
      .from('user_card_permissions')
      .select('card_key, permission_level')
      .eq('user_id', auth.userId);

    // Build permission map from explicit overrides (if any)
    const userPermissions: Record<string, PermissionLevel> | null =
      permRows && permRows.length > 0
        ? permRows.reduce((acc, r) => { acc[r.card_key] = r.permission_level as PermissionLevel; return acc; }, {} as Record<string, PermissionLevel>)
        : null;

    // Use getCardPermission — falls back to role preset if no explicit permission
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

    // 1. Find THIS TENANT's assigned jobs active on the target date.
    //    TENANT FILTER IS LOAD-BEARING: supabaseAdmin bypasses RLS — without
    //    it this route counted AND texted other tenants' crews (found Jul 13).
    //    Span shape: single-day jobs match ONLY their exact date; multi-day
    //    jobs match inside their range. NOT `end_date.is.null` in the span
    //    arm — that made every stale never-finished single-day job from past
    //    weeks "active" forever (founder: "5 tickets and nothing on the
    //    schedule").
    const { data: jobs, error: fetchError } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, location, job_type, assigned_to, helper_assigned_to, arrival_time, scheduled_date, end_date, dispatched_at')
      .eq('tenant_id', auth.tenantId)
      .not('assigned_to', 'is', null)
      .lte('scheduled_date', targetDate)
      .or(`scheduled_date.eq.${targetDate},end_date.gte.${targetDate}`)
      .in('status', ['scheduled', 'assigned', 'in_progress'])
      .is('deleted_at', null);

    if (fetchError) {
      console.error('Error fetching dispatchable jobs:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch jobs.' }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({
        success: true,
        dispatched_count: 0,
        notification_count: 0,
        message: 'No jobs to dispatch for this date.',
      });
    }

    // Duplicate-dispatch guard:
    //   - "firstTimeJobs" = dispatched_at was NULL before this call → notify + SMS (this is the
    //     call that flips dispatched_at from null → now).
    //   - "alreadyDispatchedJobs" = dispatched_at already set on a prior call → SKIP SMS +
    //     notifications (prevents duplicate texts / notifications on re-press or re-dispatch),
    //     but still report them so the UI can show "X dispatched, Y already dispatched".
    const firstTimeJobs = jobs.filter(j => j.dispatched_at === null);
    const alreadyDispatchedJobs = jobs.filter(j => j.dispatched_at !== null);

    // 2. Set dispatched_at on first-time dispatches (don't overwrite existing dispatched_at)
    const firstTimeDispatchIds = firstTimeJobs.map(j => j.id);

    if (firstTimeDispatchIds.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('job_orders')
        .update({
          dispatched_at: new Date().toISOString(),
          status: 'assigned',
        })
        .in('id', firstTimeDispatchIds);

      if (updateError) {
        console.error('Error dispatching jobs:', updateError);
        return NextResponse.json({ error: 'Failed to dispatch jobs.' }, { status: 500 });
      }
    }

    // Only first-time jobs get notified / texted. Already-dispatched jobs are skipped.
    const jobsToNotify = firstTimeJobs;

    // 4. Create notifications for operators and helpers
    const notifications: {
      recipient_id: string;
      job_order_id: string;
      type: string;
      title: string;
      message: string;
      metadata: Record<string, unknown>;
    }[] = [];

    // Get operator/helper names for notification messages
    const allUserIds = new Set<string>();
    jobsToNotify.forEach(j => {
      if (j.assigned_to) allUserIds.add(j.assigned_to);
      if (j.helper_assigned_to) allUserIds.add(j.helper_assigned_to);
    });

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, phone_number')
      .in('id', Array.from(allUserIds));

    const nameMap = new Map<string, string>();
    const phoneMap = new Map<string, string>();
    (profiles || []).forEach(p => {
      nameMap.set(p.id, p.full_name || 'Unknown');
      if (p.phone_number) phoneMap.set(p.id, p.phone_number);
    });

    const formattedDate = new Date(targetDate + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    const notifTitle = 'Job Ticket Dispatched';

    for (const job of jobsToNotify) {
      // Determine multi-day label
      const isMultiDay = job.end_date && job.end_date !== job.scheduled_date;

      // Notification for operator — always send on each push
      if (job.assigned_to) {
        notifications.push({
          recipient_id: job.assigned_to,
          job_order_id: job.id,
          type: 'dispatched',
          title: notifTitle,
          message: `You have been assigned to ${job.customer_name} at ${job.location} on ${formattedDate}.${isMultiDay ? ' (Multi-day job)' : ''}`,
          metadata: {
            job_number: job.job_number,
            customer_name: job.customer_name,
            location: job.location,
            job_type: job.job_type,
            arrival_time: job.arrival_time,
            dispatch_date: targetDate,
            is_multi_day: isMultiDay,
          },
        });
      }

      // Notification for helper — always send on each push
      if (job.helper_assigned_to) {
        notifications.push({
          recipient_id: job.helper_assigned_to,
          job_order_id: job.id,
          type: 'dispatched',
          title: notifTitle,
          message: `You have been assigned as helper for ${job.customer_name} at ${job.location} on ${formattedDate}.${isMultiDay ? ' (Multi-day job)' : ''}`,
          metadata: {
            job_number: job.job_number,
            customer_name: job.customer_name,
            location: job.location,
            job_type: job.job_type,
            arrival_time: job.arrival_time,
            dispatch_date: targetDate,
            is_helper: true,
            is_multi_day: isMultiDay,
          },
        });
      }
    }

    let notificationCount = 0;
    if (notifications.length > 0) {
      const { error: notifError, data: insertedNotifs } = await supabaseAdmin
        .from('schedule_notifications')
        .insert(notifications)
        .select('id');

      if (notifError) {
        console.error('Error creating dispatch notifications:', notifError);
        // Don't fail the whole operation — jobs are already dispatched
      } else {
        notificationCount = insertedNotifs?.length || 0;
      }
    }

    // 5. Fire-and-forget SMS to operators/helpers who have a phone number
    const appUrl = resolveAppOrigin();
    const smsPromises: Promise<unknown>[] = [];

    for (const job of jobsToNotify) {
      const formatTime = (t: string | null) => {
        if (!t) return '';
        const [h, m] = t.split(':');
        const hour = parseInt(h);
        return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
      };

      const buildMsg = (role: 'operator' | 'helper') => {
        const lines = [
          `📋 Job Dispatched — ${formattedDate}`,
          `Job #: ${job.job_number}`,
          `Customer: ${job.customer_name}`,
          `Location: ${job.location}`,
          job.arrival_time ? `Arrival: ${formatTime(job.arrival_time)}` : null,
          job.job_type ? `Type: ${job.job_type}` : null,
          role === 'helper' ? '(You are assigned as Helper)' : null,
          appUrl ? `View: ${appUrl}/dashboard/job-schedule` : null,
        ].filter(Boolean);
        return lines.join('\n');
      };

      if (job.assigned_to && phoneMap.has(job.assigned_to)) {
        smsPromises.push(
          sendSMS({ to: phoneMap.get(job.assigned_to)!, message: buildMsg('operator'), jobId: job.id })
            .catch(e => console.error(`SMS failed for operator ${job.assigned_to}:`, e))
        );
      }
      if (job.helper_assigned_to && phoneMap.has(job.helper_assigned_to)) {
        smsPromises.push(
          sendSMS({ to: phoneMap.get(job.helper_assigned_to)!, message: buildMsg('helper'), jobId: job.id })
            .catch(e => console.error(`SMS failed for helper ${job.helper_assigned_to}:`, e))
        );
      }
    }

    // Don't await — fire-and-forget (don't block response on SMS delivery)
    Promise.allSettled(smsPromises).catch(() => {});

    const dispatchedCount = jobsToNotify.length;
    const alreadyDispatchedCount = alreadyDispatchedJobs.length;

    const messageParts = [`Dispatched ${dispatchedCount} job(s) for ${formattedDate}.`];
    if (alreadyDispatchedCount > 0) {
      messageParts.push(`${alreadyDispatchedCount} already dispatched (skipped to avoid duplicate texts).`);
    }
    if (dispatchedCount > 0) {
      messageParts.push(`${notificationCount} notification(s) sent.`);
    }

    return NextResponse.json({
      success: true,
      dispatched_count: dispatchedCount,
      already_dispatched_count: alreadyDispatchedCount,
      // Total jobs active on the date (newly dispatched + already dispatched)
      total_jobs: jobs.length,
      notification_count: notificationCount,
      sms_attempted: smsPromises.length,
      message: messageParts.join(' '),
    });
  } catch (error) {
    console.error('Dispatch error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

/**
 * GET /api/admin/schedule-board/dispatch?date=YYYY-MM-DD
 * Returns the count of assigned jobs active on the given date.
 * Used to populate the "Push Tickets (N)" button on the schedule board.
 * Always returns all assigned jobs — no "dispatched" blocking, since every push is valid.
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
    // Same tenant + span rules as POST (see comment there) — the count the
    // button shows must be exactly the set POST would text.
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

    // Operator names so the modal can LIST exactly what will be pushed
    // (founder: "let me SEE the tickets that are about to be dispatched").
    const opIds = [...new Set(jobList.map((j: any) => j.assigned_to).filter(Boolean))];
    const { data: ops } = opIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', opIds)
      : { data: [] as { id: string; full_name: string }[] };
    const opName = new Map((ops ?? []).map((p: any) => [p.id, p.full_name]));

    // Check AR: find overdue balances for customers being dispatched
    const customerNames = [...new Set(jobList.map(j => j.customer_name).filter(Boolean))];
    let arWarnings: { customer_name: string; balance_due: number; days_overdue: number }[] = [];

    if (customerNames.length > 0) {
      const { data: overdueInvoices } = await supabaseAdmin
        .from('invoices')
        .select('customer_name, balance_due, due_date')
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

        arWarnings = Array.from(warningMap.entries()).map(([customer_name, data]) => ({
          customer_name,
          ...data,
        }));
      }
    }

    return NextResponse.json({
      success: true,
      date: targetDate,
      total,
      // undispatched = total (all jobs are always pushable)
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
