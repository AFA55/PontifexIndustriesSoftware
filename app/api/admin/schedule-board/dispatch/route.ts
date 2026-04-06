export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCardPermission, type PermissionLevel } from '@/lib/rbac';
import { sendSMS, formatPhoneNumber } from '@/lib/sms';

/**
 * POST /api/admin/schedule-board/dispatch
 * Push job tickets for a target date — dispatches all assigned jobs
 * and sends in-app notifications to operators and helpers.
 *
 * Body: { target_date: 'YYYY-MM-DD', force?: boolean }
 * - force: if true, re-dispatches already-dispatched jobs (for multi-day re-push)
 *
 * Multi-day job support:
 * - Jobs are queried by date range (scheduled_date <= target_date AND end_date >= target_date)
 * - dispatched_at is set only on first push (not overwritten on re-push)
 * - Per-day dispatch status is tracked via schedule_notifications (type='dispatched', metadata.dispatch_date)
 * - A job is considered "undispatched for today" if no dispatched notification exists for target_date
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
    const force = body.force === true; // re-push already-dispatched jobs

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

    const allJobIds = jobs.map(j => j.id);

    // 2. Check which jobs have already been dispatched TODAY (per-day notification check)
    //    A job is "already dispatched for today" if a dispatched notification exists with dispatch_date = targetDate
    const { data: existingNotifs } = await supabaseAdmin
      .from('schedule_notifications')
      .select('job_order_id, recipient_id')
      .in('job_order_id', allJobIds)
      .eq('type', 'dispatched')
      .contains('metadata', { dispatch_date: targetDate });

    // Build a set of "job_id|recipient_id" combos already notified today
    const alreadyNotifiedToday = new Set<string>();
    (existingNotifs || []).forEach(n => {
      if (n.job_order_id && n.recipient_id) {
        alreadyNotifiedToday.add(`${n.job_order_id}|${n.recipient_id}`);
      }
    });

    // If force=false, only dispatch jobs NOT yet notified today
    // If force=true, re-push all (for "Update Schedule" style re-notification)
    const jobsToDispatch = force
      ? jobs
      : jobs.filter(j => {
          const opKey = `${j.id}|${j.assigned_to}`;
          const helpKey = `${j.id}|${j.helper_assigned_to}`;
          // Include if operator or helper hasn't been notified today yet
          const opNotified = j.assigned_to ? alreadyNotifiedToday.has(opKey) : true;
          const helpNotified = j.helper_assigned_to ? alreadyNotifiedToday.has(helpKey) : true;
          return !opNotified || !helpNotified;
        });

    if (jobsToDispatch.length === 0) {
      return NextResponse.json({
        success: true,
        dispatched_count: 0,
        notification_count: 0,
        message: 'All jobs for this date have already been dispatched today.',
      });
    }

    // 3. Set dispatched_at on first-time dispatches (don't overwrite existing dispatched_at)
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

    // Determine if this is a re-push (for multi-day jobs already dispatched on a prior day)
    const isReDispatch = force || jobsToDispatch.some(j => j.dispatched_at !== null);
    const notifTitle = isReDispatch ? 'Job Ticket Updated' : 'Job Ticket Dispatched';

    for (const job of jobsToDispatch) {
      // Determine multi-day label
      const isMultiDay = job.end_date && job.end_date !== job.scheduled_date;

      // Notification for operator (only if not already notified today, or force=true)
      if (job.assigned_to) {
        const opKey = `${job.id}|${job.assigned_to}`;
        if (force || !alreadyNotifiedToday.has(opKey)) {
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
      }

      // Notification for helper (only if not already notified today, or force=true)
      if (job.helper_assigned_to) {
        const helpKey = `${job.id}|${job.helper_assigned_to}`;
        if (force || !alreadyNotifiedToday.has(helpKey)) {
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
      const opKey = `${job.id}|${job.assigned_to}`;
      const helpKey = `${job.id}|${job.helper_assigned_to}`;

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

      if (job.assigned_to && phoneMap.has(job.assigned_to) && (force || !alreadyNotifiedToday.has(opKey))) {
        smsPromises.push(
          sendSMS({ to: phoneMap.get(job.assigned_to)!, message: buildMsg('operator'), jobId: job.id })
            .catch(e => console.error(`SMS failed for operator ${job.assigned_to}:`, e))
        );
      }
      if (job.helper_assigned_to && phoneMap.has(job.helper_assigned_to) && (force || !alreadyNotifiedToday.has(helpKey))) {
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
 * Check dispatch status for a given date (how many jobs are dispatched vs undispatched).
 *
 * Multi-day job support:
 * - Queries by date range so multi-day jobs spanning the date are included
 * - "Undispatched" means no dispatched notification has been sent for THIS date (dispatch_date in metadata)
 * - This allows day 2+ pushes to show correctly
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
      .select('id, dispatched_at, assigned_to, helper_assigned_to, status, customer_name, scheduled_date, end_date')
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

    if (total === 0) {
      return NextResponse.json({
        success: true,
        date: targetDate,
        total: 0,
        dispatched: 0,
        undispatched: 0,
        ar_warnings: [],
      });
    }

    const jobIds = jobList.map(j => j.id);

    // Check per-day dispatch status via notifications
    // A job is "dispatched for today" if a dispatched notification exists with dispatch_date = targetDate
    const { data: todayNotifs } = await supabaseAdmin
      .from('schedule_notifications')
      .select('job_order_id')
      .in('job_order_id', jobIds)
      .eq('type', 'dispatched')
      .contains('metadata', { dispatch_date: targetDate });

    // Build set of job IDs that have been dispatched for today
    const dispatchedTodayJobIds = new Set<string>(
      (todayNotifs || []).map(n => n.job_order_id).filter(Boolean)
    );

    // For backward compatibility: also count jobs dispatched via the old method (dispatched_at set, single-day job on targetDate)
    // A single-day job (end_date = scheduled_date OR end_date is null) with dispatched_at set counts as dispatched for today
    jobList.forEach(j => {
      const isSingleDay = !j.end_date || j.end_date === j.scheduled_date;
      if (isSingleDay && j.dispatched_at !== null && j.scheduled_date === targetDate) {
        dispatchedTodayJobIds.add(j.id);
      }
    });

    const dispatched = dispatchedTodayJobIds.size;
    const undispatched = total - dispatched;

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
      dispatched,
      undispatched,
      ar_warnings: arWarnings,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
