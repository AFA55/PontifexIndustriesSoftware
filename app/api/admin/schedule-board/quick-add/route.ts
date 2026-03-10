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
    const { contractorName, startDate, durationDays, scope, salesmanName } = body;

    if (!contractorName?.trim()) {
      return NextResponse.json({ error: 'Contractor name is required' }, { status: 400 });
    }
    if (!startDate) {
      return NextResponse.json({ error: 'Start date is required' }, { status: 400 });
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
      title: `${contractorName.trim()} - Quick Add`,
      customer_name: contractorName.trim(),
      status: auth.role === 'super_admin' ? 'scheduled' : 'pending_approval',
      priority: 'medium',
      scheduled_date: startDate,
      end_date: endDate,
      description: scope || null,
      job_type: 'TBD',
      salesman_name: salesmanName || null,
      created_by: auth.userId,
      created_via: 'quick_add',
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

    console.log(`✅ Quick Add job created: ${jobNumber}`);

    return NextResponse.json(
      { success: true, data: jobOrder },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in quick-add:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
