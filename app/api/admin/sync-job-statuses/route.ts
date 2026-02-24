import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Get all job orders
    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from('job_orders')
      .select('*')
      .order('scheduled_date', { ascending: false });

    if (jobsError) {
      return NextResponse.json({ error: 'Failed to fetch job orders' }, { status: 500 });
    }

    const updates: any = {
      checked: jobs?.length || 0,
      updated: 0,
      errors: [] as string[]
    };

    // Process each job
    for (const job of jobs || []) {
      try {
        let newStatus = job.status;

        // Logic to determine correct status
        if (job.completion_signed_at) {
          newStatus = 'completed';
        } else if (job.in_progress_at && !job.completion_signed_at) {
          // Check if job has been worked on today
          const today = new Date().toISOString().split('T')[0];
          const jobDate = job.scheduled_date?.split('T')[0];

          if (jobDate === today) {
            newStatus = 'in_progress';
          } else if (jobDate && jobDate < today && !job.completion_signed_at) {
            // Job was scheduled for past date but not completed
            newStatus = 'scheduled'; // Reset to scheduled for review
          }
        } else if (job.en_route_at && !job.in_progress_at) {
          newStatus = 'en_route';
        } else if (job.scheduled_date) {
          const scheduledDate = new Date(job.scheduled_date);
          const now = new Date();

          if (scheduledDate.toDateString() === now.toDateString()) {
            // Scheduled for today but not started
            newStatus = 'scheduled';
          } else if (scheduledDate < now && !job.completion_signed_at) {
            // Past due
            newStatus = 'scheduled';
          }
        }

        // Update if status changed
        if (newStatus !== job.status) {
          const { error: updateError } = await supabaseAdmin
            .from('job_orders')
            .update({ status: newStatus })
            .eq('id', job.id);

          if (updateError) {
            console.error(`Error updating job ${job.job_number}:`, updateError);
            updates.errors.push(`Job ${job.job_number}: Failed to update status`);
          } else {
            updates.updated++;
          }
        }
      } catch (e: any) {
        console.error(`Error processing job ${job.job_number}:`, e);
        updates.errors.push(`Job ${job.job_number}: Processing error`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${updates.updated} jobs out of ${updates.checked}`,
      updates
    });

  } catch (error: any) {
    console.error('Error syncing job statuses:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
