import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    // Get user from authorization header
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get all job orders
    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from('job_orders')
      .select('*')
      .order('scheduled_date', { ascending: false });

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    const updates: any = {
      checked: jobs?.length || 0,
      updated: 0,
      errors: []
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
            updates.errors.push({
              job_number: job.job_number,
              error: updateError.message
            });
          } else {
            updates.updated++;
          }
        }
      } catch (e: any) {
        updates.errors.push({
          job_number: job.job_number,
          error: e.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${updates.updated} jobs out of ${updates.checked}`,
      updates
    });

  } catch (error: any) {
    console.error('Error syncing job statuses:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
