/**
 * API Route: POST /api/admin/job-orders/[id]/duplicate
 * Duplicates a job order to a new date, maintaining project connection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { scheduled_date, end_date, notes } = body;

    if (!scheduled_date) {
      return NextResponse.json({ error: 'scheduled_date is required' }, { status: 400 });
    }

    // Fetch original job
    const { data: original, error: fetchError } = await supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !original) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Generate new job number
    const year = new Date().getFullYear();
    const seq = Math.floor(100000 + Math.random() * 900000);
    const jobNumber = `JOB-${year}-${seq}`;

    // Fields to exclude from copy
    const excludeFields = new Set([
      'id', 'job_number', 'created_at', 'updated_at', 'status',
      'dispatched_at', 'completed_at', 'customer_signature', 'customer_signed_at',
      'loading_started_at', 'en_route_at', 'in_progress_at', 'done_for_day_at',
      'route_started_at', 'last_submitted_at', 'rejected_at', 'rejected_by',
      'rejection_reason', 'rejection_notes',
    ]);

    // Build new job data
    const newJobData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(original)) {
      if (!excludeFields.has(key)) {
        newJobData[key] = value;
      }
    }

    // Override with new values
    newJobData.job_number = jobNumber;
    newJobData.scheduled_date = scheduled_date;
    newJobData.end_date = end_date || null;
    newJobData.status = 'scheduled';
    newJobData.parent_job_id = id;
    if (notes) {
      newJobData.description = original.description
        ? `${original.description}\n\n[Continued from ${original.job_number}] ${notes}`
        : `[Continued from ${original.job_number}] ${notes}`;
    }

    const { data: newJob, error: insertError } = await supabaseAdmin
      .from('job_orders')
      .insert(newJobData)
      .select()
      .single();

    if (insertError) {
      console.error('Error duplicating job:', insertError);
      return NextResponse.json({ error: 'Failed to duplicate job' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        action: 'job_duplicated',
        entity_type: 'job_order',
        entity_id: newJob.id,
        details: { original_job_id: id, original_job_number: original.job_number, new_job_number: jobNumber },
        performed_by: auth.userId,
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data: newJob }, { status: 201 });
  } catch (error) {
    console.error('Error in duplicate job:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
