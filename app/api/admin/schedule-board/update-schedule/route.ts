export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/admin/schedule-board/update-schedule
 * Re-syncs the current schedule state for a given date to all affected operators.
 * Sends schedule_updated notifications to operators and helpers of assigned jobs.
 *
 * Body: { date: 'YYYY-MM-DD' }
 * Auth: requireAdmin()
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { date } = body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'date is required in YYYY-MM-DD format.' },
        { status: 400 }
      );
    }

    // 1. Fetch all assigned jobs for the target date
    //    Includes multi-day jobs whose range covers the date
    const { data: jobs, error: fetchError } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, location, job_type, assigned_to, helper_assigned_to, status, scheduled_date, end_date, arrival_time, tenant_id')
      .not('assigned_to', 'is', null)
      .lte('scheduled_date', date)
      .or(`end_date.is.null,end_date.gte.${date}`)
      .is('deleted_at', null)
      .eq('tenant_id', auth.tenantId || '');

    if (fetchError) {
      console.error('Error fetching jobs for update-schedule:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch jobs.' }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({
        success: true,
        data: { jobsUpdated: 0, operatorsNotified: 0 },
        message: 'No assigned jobs found for this date.',
      });
    }

    // 2. Update updated_at for all affected jobs.
    //    Do NOT downgrade in-progress or further-along statuses.
    const jobIds = jobs.map(j => j.id);

    // Update jobs that are still in 'scheduled' or 'assigned' states
    const jobsToEnsureAssigned = jobs
      .filter(j => j.status === 'scheduled')
      .map(j => j.id);

    if (jobsToEnsureAssigned.length > 0) {
      await supabaseAdmin
        .from('job_orders')
        .update({ status: 'assigned', updated_at: new Date().toISOString() })
        .in('id', jobsToEnsureAssigned);
    }

    // Touch updated_at on all remaining jobs (in_progress, assigned, etc.)
    const jobsToTouch = jobIds.filter(id => !jobsToEnsureAssigned.includes(id));
    if (jobsToTouch.length > 0) {
      await supabaseAdmin
        .from('job_orders')
        .update({ updated_at: new Date().toISOString() })
        .in('id', jobsToTouch);
    }

    // 3. Build notifications for all operators and helpers
    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    const notificationTitle = `Schedule Updated for ${date}`;
    const notificationMessage = `Your schedule has been updated. Please review your jobs for ${formattedDate}.`;

    // Collect per-job notifications (not just unique recipients) so operators see which job was updated
    // Also insert a dispatched-type notification so per-day dispatch tracking reflects this update
    const notifications: {
      recipient_id: string;
      job_order_id?: string;
      type: string;
      title: string;
      message: string;
      metadata: Record<string, unknown>;
    }[] = [];

    for (const job of jobs) {
      if (job.assigned_to) {
        // schedule_updated notification
        notifications.push({
          recipient_id: job.assigned_to,
          job_order_id: job.id,
          type: 'schedule_updated',
          title: notificationTitle,
          message: `Your job at ${job.location} for ${job.customer_name} has been updated for ${formattedDate}.`,
          metadata: { date, formatted_date: formattedDate, job_number: job.job_number, dispatch_date: date },
        });
        // Also insert a dispatched-type notification so per-day dispatch status is tracked
        notifications.push({
          recipient_id: job.assigned_to,
          job_order_id: job.id,
          type: 'dispatched',
          title: 'Job Ticket Updated',
          message: `Your job at ${job.location} for ${job.customer_name} has been updated for ${formattedDate}.`,
          metadata: { date, formatted_date: formattedDate, job_number: job.job_number, dispatch_date: date, via_update_schedule: true },
        });
      }
      if (job.helper_assigned_to) {
        notifications.push({
          recipient_id: job.helper_assigned_to,
          job_order_id: job.id,
          type: 'schedule_updated',
          title: notificationTitle,
          message: `Your helper assignment at ${job.location} for ${job.customer_name} has been updated for ${formattedDate}.`,
          metadata: { date, formatted_date: formattedDate, job_number: job.job_number, dispatch_date: date, is_helper: true },
        });
        notifications.push({
          recipient_id: job.helper_assigned_to,
          job_order_id: job.id,
          type: 'dispatched',
          title: 'Job Ticket Updated',
          message: `Your helper assignment at ${job.location} for ${job.customer_name} has been updated for ${formattedDate}.`,
          metadata: { date, formatted_date: formattedDate, job_number: job.job_number, dispatch_date: date, via_update_schedule: true, is_helper: true },
        });
      }
    }

    // Count unique recipients for the response message
    const uniqueRecipients = new Set(notifications.map(n => n.recipient_id)).size;
    let operatorsNotified = uniqueRecipients;

    if (notifications.length > 0) {
      // Fire-and-forget pattern — don't block on notification insert
      Promise.resolve(
        supabaseAdmin
          .from('schedule_notifications')
          .insert(notifications)
          .select('id')
      ).then(({ data, error }) => {
        if (error) console.error('Error inserting schedule_updated notifications:', error);
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: {
        jobsUpdated: jobIds.length,
        operatorsNotified,
      },
      message: `Schedule updated for ${formattedDate}. ${operatorsNotified} operator(s) notified.`,
    });
  } catch (error) {
    console.error('update-schedule error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
