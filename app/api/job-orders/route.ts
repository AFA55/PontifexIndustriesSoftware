export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/job-orders
 * Get job orders assigned to the current operator
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';

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
    const includeHelperJobs = searchParams.get('include_helper_jobs') === 'true';
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const userRole = profile?.role || 'operator';
    const isAdmin = ['super_admin', 'operations_manager', 'admin', 'salesman', 'shop_manager', 'inventory_manager'].includes(userRole);
    const tenantId = await getTenantId(user.id);

    // If ID is provided, fetch that specific job
    if (id) {
      let specificJobQuery = supabaseAdmin
        .from('active_job_orders')
        .select('*')
        .eq('id', id);
      if (tenantId) specificJobQuery = specificJobQuery.eq('tenant_id', tenantId);
      const { data: specificJob, error: jobError } = await specificJobQuery.single();

      if (jobError) {
        console.error('Error fetching specific job:', jobError);
        return NextResponse.json(
          { error: 'Failed to fetch job' },
          { status: 500 }
        );
      }

      if (!specificJob) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        );
      }

      // Check if user has access to this job (operator OR helper)
      if (!isAdmin && specificJob.assigned_to !== user.id && specificJob.helper_assigned_to !== user.id) {
        return NextResponse.json(
          { error: 'Unauthorized to view this job' },
          { status: 403 }
        );
      }

      // Fetch operator profile data for autofilling forms
      let operatorProfile = null;
      let assignedOperatorProfile = null;

      // Get current user's profile
      const { data: currentUserProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, phone_number, email')
        .eq('id', user.id)
        .single();

      operatorProfile = currentUserProfile;

      // Get assigned operator's profile (for the employees list)
      if (specificJob.assigned_to) {
        const { data: assignedProfile } = await supabaseAdmin
          .from('profiles')
          .select('full_name, phone_number, email')
          .eq('id', specificJob.assigned_to)
          .single();

        assignedOperatorProfile = assignedProfile;
      }

      console.log('Returning specific job:', specificJob.job_number);
      return NextResponse.json(
        {
          success: true,
          data: [specificJob],
          user_role: userRole,
          operator_profile: operatorProfile,
          assigned_operator_profile: assignedOperatorProfile
        },
        { status: 200 }
      );
    }

    // Build query from active_job_orders view
    let query = supabaseAdmin
      .from('active_job_orders')
      .select('*');

    // Scope to tenant
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    // If not admin, scope to jobs the user is operator OR helper on
    if (!isAdmin) {
      if (includeHelperJobs) {
        // Use OR filter: assigned_to = uid OR helper_assigned_to = uid
        query = query.or(`assigned_to.eq.${user.id},helper_assigned_to.eq.${user.id}`);
      } else {
        query = query.eq('assigned_to', user.id);
      }
    }

    // Filter by scheduled_date if provided
    if (scheduledDate) {
      query = query.eq('scheduled_date', scheduledDate);
    }

    // Date range filters (used by 7-day lookahead on my-jobs)
    if (dateFrom) {
      query = query.gte('scheduled_date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('scheduled_date', dateTo);
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
        { error: 'Failed to fetch job orders' },
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
        user_role: userRole,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in job orders route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
