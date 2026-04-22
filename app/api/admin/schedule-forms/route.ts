export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/schedule-forms
 * List job orders with their schedule form submission history.
 *
 * Query params:
 *   status: 'pending_approval' | 'scheduled' | 'rejected' | 'all' (default: 'all')
 *   submitted_by: UUID — filter by creator
 *   from_date / to_date: date range for created_at
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const submittedBy = searchParams.get('submitted_by');
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');

    // Build query for job orders created via schedule_form
    let query = supabaseAdmin
      .from('job_orders')
      .select(`
        id,
        job_number,
        title,
        customer_name,
        job_type,
        location,
        address,
        status,
        priority,
        scheduled_date,
        end_date,
        estimated_cost,
        description,
        equipment_needed,
        created_by,
        created_via,
        created_at,
        updated_at,
        rejection_reason,
        rejection_notes,
        rejected_by,
        rejected_at,
        last_submitted_at,
        project_name,
        salesman_name,
        po_number,
        customer_contact,
        site_contact_phone,
        scope_details,
        equipment_selections,
        special_equipment_notes,
        equipment_rentals,
        scheduling_flexibility,
        site_compliance,
        permit_required,
        permits,
        job_difficulty_rating,
        additional_info,
        jobsite_conditions,
        is_will_call
      `)
      .eq('created_via', 'schedule_form')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Filter by status
    if (status === 'pending_approval') {
      query = query.eq('status', 'pending_approval');
    } else if (status === 'scheduled') {
      query = query.eq('status', 'scheduled');
    } else if (status === 'rejected') {
      query = query.eq('status', 'rejected');
    }
    // 'all' = no status filter

    // Filter by submitter
    if (submittedBy) {
      query = query.eq('created_by', submittedBy);
    }

    // Date range
    if (fromDate) {
      query = query.gte('created_at', `${fromDate}T00:00:00`);
    }
    if (toDate) {
      query = query.lte('created_at', `${toDate}T23:59:59`);
    }

    const { data: jobs, error: jobsError } = await query.limit(200);

    if (jobsError) {
      console.error('Error fetching schedule forms:', jobsError);
      return NextResponse.json({ error: 'Failed to fetch schedule forms' }, { status: 500 });
    }

    // Fetch submission history for all returned jobs
    const jobIds = (jobs || []).map(j => j.id);
    let submissions: any[] = [];

    if (jobIds.length > 0) {
      const { data: subs, error: subsError } = await supabaseAdmin
        .from('schedule_form_submissions')
        .select('*')
        .in('job_order_id', jobIds)
        .order('created_at', { ascending: true });

      if (!subsError && subs) {
        submissions = subs;
      }
    }

    // Fetch creator profiles
    const creatorIds = [...new Set((jobs || []).map(j => j.created_by).filter(Boolean))];
    let creatorMap: Record<string, string> = {};

    if (creatorIds.length > 0) {
      const { data: creators } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', creatorIds);

      if (creators) {
        creators.forEach(c => { creatorMap[c.id] = c.full_name || 'Unknown'; });
      }
    }

    // Group submissions by job_order_id
    const submissionsByJob: Record<string, any[]> = {};
    submissions.forEach(sub => {
      if (!submissionsByJob[sub.job_order_id]) {
        submissionsByJob[sub.job_order_id] = [];
      }
      submissionsByJob[sub.job_order_id].push(sub);
    });

    // Build response
    const result = (jobs || []).map(job => ({
      ...job,
      created_by_name: creatorMap[job.created_by] || 'Unknown',
      submission_history: submissionsByJob[job.id] || [],
    }));

    return NextResponse.json({
      success: true,
      data: result,
      count: result.length,
    });
  } catch (error: any) {
    console.error('Unexpected error in schedule-forms route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
