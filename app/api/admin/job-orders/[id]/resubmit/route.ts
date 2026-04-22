export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/admin/job-orders/[id]/resubmit
 * Admin resubmits a rejected schedule form with updated data.
 *
 * Body: { form_data } — updated job order fields
 * - Sets status back to 'pending_approval'
 * - Sets last_submitted_at
 * - Clears rejection fields
 * - Creates schedule_form_submissions entry (action: 'resubmitted')
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { form_data } = body;

    if (!form_data || typeof form_data !== 'object') {
      return NextResponse.json({ error: 'form_data is required and must be an object' }, { status: 400 });
    }

    // Fetch the job order
    const { data: jobOrder, error: fetchError } = await supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !jobOrder) {
      return NextResponse.json({ error: 'Job order not found' }, { status: 404 });
    }

    if (jobOrder.status !== 'rejected') {
      return NextResponse.json(
        { error: `Cannot resubmit a job with status '${jobOrder.status}'. Only rejected jobs can be resubmitted.` },
        { status: 400 }
      );
    }

    // Get submitter profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .single();

    const submitterName = profile?.full_name || auth.userEmail;

    // Build update — allow updating common schedule form fields
    const allowedFields = [
      'customer_name', 'customer_contact', 'site_contact_phone', 'address', 'location',
      'description', 'job_type', 'estimated_cost', 'scope_details', 'scope_photo_urls',
      'equipment_needed', 'equipment_selections', 'special_equipment_notes', 'equipment_rentals',
      'scheduled_date', 'end_date', 'scheduling_flexibility',
      'site_compliance', 'permit_required', 'permits',
      'job_difficulty_rating', 'additional_info',
      'jobsite_conditions', 'salesman_name', 'po_number', 'project_name',
    ];

    const updateFields: Record<string, any> = {
      status: 'pending_approval',
      last_submitted_at: new Date().toISOString(),
      rejection_reason: null,
      rejection_notes: null,
      rejected_by: null,
      rejected_at: null,
      updated_at: new Date().toISOString(),
    };

    allowedFields.forEach(field => {
      if (field in form_data) {
        updateFields[field] = form_data[field];
      }
    });

    // Also update title if customer_name or job_type changed
    if (form_data.customer_name || form_data.job_type) {
      const customerName = form_data.customer_name || jobOrder.customer_name;
      const jobType = form_data.job_type || jobOrder.job_type;
      updateFields.title = `${customerName} - ${jobType?.split(',')[0]?.trim() || 'Job'}`;
    }

    const { data: updatedJob, error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error resubmitting job order:', updateError);
      return NextResponse.json({ error: 'Failed to resubmit job order' }, { status: 500 });
    }

    // Create schedule_form_submissions entry
    Promise.resolve(
      supabaseAdmin.from('schedule_form_submissions').insert({
        job_order_id: id,
        submitted_by: auth.userId,
        submitted_by_name: submitterName,
        action: 'resubmitted',
        notes: `Resubmitted by ${submitterName} after rejection`,
        form_snapshot: updatedJob,
      })
    ).catch(() => {});

    // Audit log (fire-and-forget)
    Promise.resolve(
      supabaseAdmin.from('job_orders_history').insert({
        job_order_id: id,
        job_number: jobOrder.job_number,
        changed_by: auth.userId,
        changed_by_name: submitterName,
        changed_by_role: auth.role,
        change_type: 'resubmitted',
        changes: {
          status: { old: 'rejected', new: 'pending_approval' },
        },
        snapshot: updatedJob,
      })
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Job ${jobOrder.job_number} resubmitted for approval`,
      data: updatedJob,
    });
  } catch (error: any) {
    console.error('Unexpected error in resubmit route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
