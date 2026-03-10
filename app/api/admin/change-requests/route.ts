/**
 * GET/POST /api/admin/change-requests
 * Manage schedule change requests.
 * GET: list change requests for a job (admin, super_admin, salesman)
 * POST: create a new change request (admin, super_admin, salesman)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const jobOrderId = searchParams.get('jobOrderId');
    const status = searchParams.get('status');

    let query = supabaseAdmin
      .from('schedule_change_requests')
      .select(`
        *,
        requester:requested_by(full_name),
        reviewer:reviewed_by(full_name)
      `)
      .order('created_at', { ascending: false });

    if (jobOrderId) {
      query = query.eq('job_order_id', jobOrderId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching change requests:', error);
      return NextResponse.json(
        { error: 'Failed to fetch change requests' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/change-requests:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();

    if (!body.jobOrderId || !body.requestType || !body.description) {
      return NextResponse.json(
        { error: 'Missing required fields: jobOrderId, requestType, description' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('schedule_change_requests')
      .insert({
        job_order_id: body.jobOrderId,
        requested_by: auth.userId,
        request_type: body.requestType,
        description: body.description,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating change request:', error);
      return NextResponse.json(
        { error: 'Failed to create change request' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Change request created', data },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/change-requests:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
