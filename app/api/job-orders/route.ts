/**
 * API Route: GET /api/job-orders
 * Get job orders assigned to the current operator
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    // Get user from Supabase session (server-side)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const includeCompleted = searchParams.get('includeCompleted') === 'true';
    const scheduledDate = searchParams.get('scheduled_date');

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';

    // If ID is provided, fetch that specific job
    if (id) {
      const { data: specificJob, error: jobError } = await supabaseAdmin
        .from('active_job_orders')
        .select('*')
        .eq('id', id)
        .single();

      if (jobError) {
        console.error('Error fetching specific job:', jobError);
        return NextResponse.json(
          { error: 'Failed to fetch job', details: jobError.message },
          { status: 500 }
        );
      }

      if (!specificJob) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        );
      }

      // Check if user has access to this job
      if (!isAdmin && specificJob.assigned_to !== user.id) {
        return NextResponse.json(
          { error: 'Unauthorized to view this job' },
          { status: 403 }
        );
      }

      console.log('Returning specific job:', specificJob.job_number);
      return NextResponse.json(
        {
          success: true,
          data: [specificJob],
        },
        { status: 200 }
      );
    }

    // Build query from active_job_orders view
    let query = supabaseAdmin
      .from('active_job_orders')
      .select('*');

    // If not admin, only show jobs assigned to this user
    if (!isAdmin) {
      query = query.eq('assigned_to', user.id);
    }

    // Filter by scheduled_date if provided
    if (scheduledDate) {
      query = query.eq('scheduled_date', scheduledDate);
    }

    query = query.order('scheduled_date', { ascending: true });

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Exclude completed jobs unless explicitly requested
    if (!includeCompleted) {
      query = query.neq('status', 'completed');
    }

    const { data: jobOrders, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching job orders:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch job orders', details: fetchError.message },
        { status: 500 }
      );
    }

    console.log('Returning job orders with shop_arrival_time:',
      (jobOrders || []).map((j: any) => ({
        id: j.id,
        job_number: j.job_number,
        shop_arrival_time: j.shop_arrival_time,
        arrival_time: j.arrival_time
      }))
    );

    return NextResponse.json(
      {
        success: true,
        data: jobOrders || [],
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in job orders route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
