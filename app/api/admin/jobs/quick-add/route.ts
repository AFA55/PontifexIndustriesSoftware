export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/jobs/quick-add
 * Create a placeholder job on the schedule with minimal info.
 * Sends a quick_add_followup notification to the salesperson/admin to complete the full form.
 * Access: admin, super_admin, operations_manager, salesman
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const {
      customer_name,
      job_type,
      address,
      scheduled_date,
      assigned_to,
      notes,
    } = body;

    // Validate required fields
    if (!customer_name?.trim()) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }
    if (!job_type?.trim()) {
      return NextResponse.json({ error: 'Job type is required' }, { status: 400 });
    }
    if (!scheduled_date) {
      return NextResponse.json({ error: 'Scheduled date is required' }, { status: 400 });
    }

    // Generate job number with QA prefix (Quick Add)
    const jobNumber = `QA-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const jobOrderData: Record<string, unknown> = {
      job_number: jobNumber,
      title: `${customer_name.trim()} — ${job_type}`,
      customer_name: customer_name.trim(),
      job_type: job_type,
      service_types: [job_type],
      address: address?.trim() || null,
      location: address?.trim() || null,
      scheduled_date,
      assigned_to: assigned_to || null,
      status: 'scheduled',
      priority: 'medium',
      created_by: auth.userId,
      created_via: 'quick_add',
      notes: notes?.trim() || null,
      missing_info_items: ['equipment_needed', 'jobsite_conditions', 'permits', 'full_scope'],
      missing_info_note: 'Created via Quick Add — please complete the full Schedule Form.',
      tenant_id: auth.tenantId || null,
    };

    const { data: jobOrder, error: insertError } = await supabaseAdmin
      .from('job_orders')
      .insert(jobOrderData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating quick-add job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create job', details: insertError.message },
        { status: 500 }
      );
    }

    // Send quick_add_followup notification to the creating user (or assigned salesperson)
    Promise.resolve(
      supabaseAdmin.from('schedule_notifications').insert({
        recipient_id: auth.userId,
        job_order_id: jobOrder.id,
        type: 'quick_add_followup',
        title: `Complete details for ${customer_name.trim()}`,
        message: `Quick Add job ${jobNumber} needs a full schedule form — please complete the details.`,
        metadata: {
          job_number: jobNumber,
          customer_name: customer_name.trim(),
          job_type,
          scheduled_date,
          created_by: auth.userEmail,
          missing_items: ['equipment_needed', 'jobsite_conditions', 'permits', 'full_scope'],
        },
      })
    ).then(({ error: notifError }) => {
      if (notifError) console.error('Error sending quick-add followup notification:', notifError);
    }).catch(() => {});

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'quick_add_job_created',
        entity_type: 'job_order',
        entity_id: jobOrder.id,
        details: {
          job_number: jobNumber,
          customer: customer_name.trim(),
          job_type,
          scheduled_date,
        },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json(
      { success: true, data: { id: jobOrder.id, job_number: jobNumber } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in quick-add:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
