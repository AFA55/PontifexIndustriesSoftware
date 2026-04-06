export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCardPermission, type PermissionLevel } from '@/lib/rbac';
import { sendSMS } from '@/lib/sms';

/**
 * POST /api/admin/schedule-board/dispatch
 * Push job tickets for a target date — dispatches all assigned jobs
 * and sends in-app notifications to operators and helpers.
 *
 * Body: { target_date: 'YYYY-MM-DD' }
 *
 * Behavior:
 * - Always pushes ALL assigned jobs active on target_date (no blocking on prior dispatch state)
 * - Each push inserts a schedule_notification with type='dispatched' and metadata.dispatch_date=targetDate
 * - dispatched_at is set on first-ever dispatch only (not overwritten on re-push)
 * - Multi-day jobs are included via date-range query (scheduled_date <= target AND end_date >= target)
 */
export async function POST(request: NextRequest) {
  const auth = await requireScheduleBoardAccess(request);
  if (!auth.authorized) return auth.response;

  // Only users with full schedule_board access can dispatch
  if (!['super_admin', 'operations_manager'].includes(auth.role)) {
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

    // 1. Find all assigned jobs active on the target date (single-day AND multi-day)
    //    A job is active on targetDate if: scheduled_date <= targetDate AND (end_date IS NULL OR end_date >= targetDate)
    const { data: jobs, error: fetchError } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, location, job_type, assigned_to, helper_assigned_to, arrival_time, scheduled_date, end_date, dispatched_at')
      .not('assigned_to', 'is', null)
      .lte('scheduled_date', targetDate)
      .or(`end_date.is.null,end_date.gte.${targetDate}`)
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

    // Always dispatch all assigned jobs on the target date — no blocking on prior dispatch state
    const jobsToDispatch = jobs;

    // 2. Set dispatched_at on first-time dispatches (don't overwrite existing dispatched_at)
    const firstTimeDispatchIds = jobsToDispatch
      .filter(j => j.dispatched_at === null)
      .map(j => j.id);

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
    jobsToDispatch.forEach(j => {
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

    for (const job of jobsToDispatch) {
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const smsPromises: Promise<any>[] = [];

    for (const job of jobsToDispatch) {
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

    return NextResponse.json({
      success: true,
      dispatched_count: jobsToDispatch.length,
      notification_count: notificationCount,
      sms_attempted: smsPromises.length,
      message: `Dispatched ${jobsToDispatch.length} job(s) for ${formattedDate}. ${notificationCount} notification(s) sent.`,
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

  try {
    // Query jobs active on targetDate (single-day and multi-day)
    const { data: jobs, error } = await supabaseAdmin
      .from('job_orders')
      .select('id, customer_name, scheduled_date, end_date')
      .not('assigned_to', 'is', null)
      .is('deleted_at', null)
      .lte('scheduled_date', targetDate)
      .or(`end_date.is.null,end_date.gte.${targetDate}`)
      .in('status', ['scheduled', 'assigned', 'in_route', 'in_progress']);

    if (error) {
      return NextResponse.json({ error: 'Failed to check dispatch status.' }, { status: 500 });
    }

    const jobList = jobs || [];
    const total = jobList.length;

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
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
