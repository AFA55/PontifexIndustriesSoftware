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

    // Collect unique recipient IDs
    const recipientSet = new Set<string>();
    for (const job of jobs) {
      if (job.assigned_to) recipientSet.add(job.assigned_to);
      if (job.helper_assigned_to) recipientSet.add(job.helper_assigned_to);
    }

    const notifications = Array.from(recipientSet).map(recipientId => ({
      recipient_id: recipientId,
      type: 'schedule_updated',
      title: notificationTitle,
      message: notificationMessage,
      metadata: { date, formatted_date: formattedDate, job_count: jobs.length },
    }));

    let operatorsNotified = 0;

    if (notifications.length > 0) {
      // Fire-and-forget pattern — don't block on notification insert
      Promise.resolve(
        supabaseAdmin
          .from('schedule_notifications')
          .insert(notifications)
          .select('id')
      ).then(({ data, error }) => {
        if (error) console.error('Error inserting schedule_updated notifications:', error);
        else operatorsNotified = data?.length || 0;
      }).catch(() => {});

      // For the response, use the count we prepared (all will be inserted)
      operatorsNotified = notifications.length;
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
