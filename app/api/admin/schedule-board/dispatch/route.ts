import { NextRequest, NextResponse } from 'next/server';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCardPermission, type PermissionLevel } from '@/lib/rbac';

/**
 * POST /api/admin/schedule-board/dispatch
 * Push job tickets for a target date — dispatches all assigned jobs
 * and sends in-app notifications to operators and helpers.
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

    // 1. Find all dispatchable jobs for the target date
    const { data: jobs, error: fetchError } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, location, job_type, assigned_to, helper_assigned_to, arrival_time, scheduled_date')
      .eq('scheduled_date', targetDate)
      .not('assigned_to', 'is', null)
      .in('status', ['scheduled', 'assigned'])
      .is('dispatched_at', null)
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

    // 2. Batch update: set dispatched_at and ensure status is 'assigned'
    const jobIds = jobs.map(j => j.id);
    const { error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update({
        dispatched_at: new Date().toISOString(),
        status: 'assigned',
      })
      .in('id', jobIds);

    if (updateError) {
      console.error('Error dispatching jobs:', updateError);
      return NextResponse.json({ error: 'Failed to dispatch jobs.' }, { status: 500 });
    }

    // 3. Create notifications for operators and helpers
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
    jobs.forEach(j => {
      if (j.assigned_to) allUserIds.add(j.assigned_to);
      if (j.helper_assigned_to) allUserIds.add(j.helper_assigned_to);
    });

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .in('id', Array.from(allUserIds));

    const nameMap = new Map<string, string>();
    (profiles || []).forEach(p => nameMap.set(p.id, p.full_name || 'Unknown'));

    const formattedDate = new Date(targetDate + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    for (const job of jobs) {
      // Notification for operator
      if (job.assigned_to) {
        notifications.push({
          recipient_id: job.assigned_to,
          job_order_id: job.id,
          type: 'dispatched',
          title: 'Job Ticket Dispatched',
          message: `You have been assigned to ${job.customer_name} at ${job.location} on ${formattedDate}.`,
          metadata: {
            job_number: job.job_number,
            customer_name: job.customer_name,
            location: job.location,
            job_type: job.job_type,
            arrival_time: job.arrival_time,
          },
        });
      }

      // Notification for helper
      if (job.helper_assigned_to) {
        notifications.push({
          recipient_id: job.helper_assigned_to,
          job_order_id: job.id,
          type: 'dispatched',
          title: 'Job Ticket Dispatched',
          message: `You have been assigned as helper for ${job.customer_name} at ${job.location} on ${formattedDate}.`,
          metadata: {
            job_number: job.job_number,
            customer_name: job.customer_name,
            location: job.location,
            job_type: job.job_type,
            arrival_time: job.arrival_time,
            is_helper: true,
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

    return NextResponse.json({
      success: true,
      dispatched_count: jobIds.length,
      notification_count: notificationCount,
      message: `Dispatched ${jobIds.length} job(s) for ${formattedDate}. ${notificationCount} notification(s) sent.`,
    });
  } catch (error) {
    console.error('Dispatch error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

/**
 * GET /api/admin/schedule-board/dispatch?date=YYYY-MM-DD
 * Check dispatch status for a given date (how many jobs are dispatched vs undispatched).
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
    const { data: jobs, error } = await supabaseAdmin
      .from('job_orders')
      .select('id, dispatched_at, assigned_to, status')
      .eq('scheduled_date', targetDate)
      .not('assigned_to', 'is', null)
      .is('deleted_at', null)
      .in('status', ['scheduled', 'assigned', 'in_route', 'in_progress']);

    if (error) {
      return NextResponse.json({ error: 'Failed to check dispatch status.' }, { status: 500 });
    }

    const total = jobs?.length || 0;
    const dispatched = jobs?.filter(j => j.dispatched_at !== null).length || 0;
    const undispatched = total - dispatched;

    return NextResponse.json({
      success: true,
      date: targetDate,
      total,
      dispatched,
      undispatched,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
