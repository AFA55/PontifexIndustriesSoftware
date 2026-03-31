/**
 * POST /api/admin/schedule-board/quick-add
 * Quick-add a pending job with minimal info (contractor, date, duration, scope).
 * Access: admin, super_admin, salesman
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const {
      contractorName, startDate, durationDays, scope, salesmanName,
      salesmanId, jobType, address, contactName, contactPhone, priority, estimatedCost
    } = body;

    if (!contractorName?.trim()) {
      return NextResponse.json({ error: 'Contractor name is required' }, { status: 400 });
    }
    if (!startDate) {
      return NextResponse.json({ error: 'Start date is required' }, { status: 400 });
    }
    if (!jobType) {
      return NextResponse.json({ error: 'Job type is required' }, { status: 400 });
    }

    // Calculate end date from duration
    let endDate: string | null = null;
    if (durationDays && durationDays > 1) {
      const start = new Date(startDate + 'T00:00:00');
      start.setDate(start.getDate() + (durationDays - 1));
      endDate = start.toISOString().split('T')[0];
    }

    const jobNumber = `QA-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const jobOrderData: Record<string, any> = {
      job_number: jobNumber,
      title: `${contractorName.trim()} — ${jobType}`,
      customer_name: contractorName.trim(),
      customer_contact: contactPhone || null,
      status: auth.role === 'super_admin' ? 'scheduled' : 'pending_approval',
      priority: priority || 'medium',
      scheduled_date: startDate,
      end_date: endDate,
      description: scope || null,
      job_type: jobType,
      address: address || null,
      location: address || null,
      foreman_name: contactName || null,
      foreman_phone: contactPhone || null,
      salesman_name: salesmanName || null,
      estimated_cost: estimatedCost ? Number(estimatedCost) : null,
      created_by: auth.userId,
      created_via: 'quick_add',
      missing_info_items: ['equipment_needed', 'jobsite_conditions', 'permits', 'full_scope'],
      missing_info_note: 'Created via Quick Add — please complete the full Schedule Form.',
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

    // Send notification to the salesman to complete the full form
    const recipientId = salesmanId || null;
    if (recipientId) {
      Promise.resolve(
        supabaseAdmin.from('schedule_notifications').insert({
          recipient_id: recipientId,
          recipient_name: salesmanName || 'Salesman',
          job_order_id: jobOrder.id,
          type: 'missing_info',
          title: `Complete details for ${contractorName.trim()}`,
          message: `Quick Add job ${jobNumber} needs full Schedule Form completion: equipment, permits, jobsite conditions, and detailed scope.`,
          metadata: {
            job_number: jobNumber,
            customer_name: contractorName.trim(),
            job_type: jobType,
            scheduled_date: startDate,
            created_by: auth.userEmail,
            missing_items: ['equipment_needed', 'jobsite_conditions', 'permits', 'full_scope'],
          },
        })
      ).then(({ error: notifError }) => {
        if (notifError) console.error('Error sending quick-add notification:', notifError);
      }).catch(() => {});
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'quick_add_job_created',
        entity_type: 'job_order',
        entity_id: jobOrder.id,
        details: { job_number: jobNumber, customer: contractorName.trim(), job_type: jobType, salesman: salesmanName },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json(
      { success: true, data: jobOrder },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in quick-add:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
