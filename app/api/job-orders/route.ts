/**
 * API Route: GET /api/job-orders
 * Get job orders assigned to the current operator
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require authenticated user
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const includeCompleted = searchParams.get('includeCompleted') === 'true';
    const scheduledDate = searchParams.get('scheduled_date');

    // Use role from auth result
    const profile = { role: auth.role };
    const isAdmin = auth.role === 'admin';

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

      // Check if user has access to this job
      if (!isAdmin && specificJob.assigned_to !== auth.userId) {
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
        .eq('id', auth.userId)
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
          operator_profile: operatorProfile,
          assigned_operator_profile: assignedOperatorProfile
        },
        { status: 200 }
      );
    }

    // Additional query params for schedule view
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const includeHelperJobs = searchParams.get('include_helper_jobs') === 'true';
    const dispatchedOnly = searchParams.get('dispatched_only') === 'true';

    const isAdminRole = ['admin', 'super_admin', 'operations_manager', 'salesman', 'supervisor'].includes(profile?.role || '');
    const isFieldWorker = ['operator', 'apprentice'].includes(profile?.role || '');

    // For operators/helpers: use OR filter (assigned_to OR helper_assigned_to)
    if (!isAdminRole && (includeHelperJobs || isFieldWorker)) {
      // Need two separate queries and merge results
      let operatorQuery = supabaseAdmin.from('active_job_orders').select('*').eq('assigned_to', auth.userId);
      let helperQuery = supabaseAdmin.from('active_job_orders').select('*').eq('helper_assigned_to', auth.userId);

      // Apply shared filters
      // For date filtering, include multi-day jobs where the date falls within scheduled_date..end_date
      if (scheduledDate) {
        // Jobs that either:
        // 1. Start on this date (exact match) OR
        // 2. Are multi-day and this date falls within their range (scheduled_date <= date AND end_date >= date)
        operatorQuery = operatorQuery.or(`scheduled_date.eq.${scheduledDate},and(scheduled_date.lte.${scheduledDate},end_date.gte.${scheduledDate})`);
        helperQuery = helperQuery.or(`scheduled_date.eq.${scheduledDate},and(scheduled_date.lte.${scheduledDate},end_date.gte.${scheduledDate})`);
      }
      if (dateFrom) {
        operatorQuery = operatorQuery.gte('scheduled_date', dateFrom);
        helperQuery = helperQuery.gte('scheduled_date', dateFrom);
      }
      if (dateTo) {
        operatorQuery = operatorQuery.lte('scheduled_date', dateTo);
        helperQuery = helperQuery.lte('scheduled_date', dateTo);
      }
      if (status) {
        operatorQuery = operatorQuery.eq('status', status);
        helperQuery = helperQuery.eq('status', status);
      }
      if (!includeCompleted) {
        operatorQuery = operatorQuery.neq('status', 'completed');
        helperQuery = helperQuery.neq('status', 'completed');
      }
      if (dispatchedOnly) {
        operatorQuery = operatorQuery.not('dispatched_at', 'is', null);
        helperQuery = helperQuery.not('dispatched_at', 'is', null);
      }

      operatorQuery = operatorQuery.order('scheduled_date', { ascending: true });
      helperQuery = helperQuery.order('scheduled_date', { ascending: true });

      const [opResult, helperResult] = await Promise.all([operatorQuery, helperQuery]);

      if (opResult.error) {
        console.error('Error fetching operator jobs:', opResult.error);
        return NextResponse.json({ error: 'Failed to fetch job orders' }, { status: 500 });
      }

      // Merge and deduplicate by id
      const allJobs = [...(opResult.data || [])];
      const seenIds = new Set(allJobs.map((j: any) => j.id));
      for (const job of (helperResult.data || [])) {
        if (!seenIds.has(job.id)) {
          allJobs.push(job);
          seenIds.add(job.id);
        }
      }

      // Strip sensitive fields for field workers
      const sanitized = isFieldWorker
        ? allJobs.map((j: any) => { const { difficulty_rating, estimated_cost, ...rest } = j; return rest; })
        : allJobs;

      return NextResponse.json({ success: true, data: sanitized, user_role: profile?.role }, { status: 200 });
    }

    // Standard admin/single-role query
    let query = supabaseAdmin
      .from('active_job_orders')
      .select('*');

    // If not admin, only show jobs assigned to this user
    if (!isAdminRole) {
      query = query.eq('assigned_to', auth.userId);
    }

    // Filter by scheduled_date — also include multi-day jobs spanning this date
    if (scheduledDate) {
      query = query.or(`scheduled_date.eq.${scheduledDate},and(scheduled_date.lte.${scheduledDate},end_date.gte.${scheduledDate})`);
    }
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

    if (dispatchedOnly) {
      query = query.not('dispatched_at', 'is', null);
    }

    const { data: jobOrders, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching job orders:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch job orders' },
        { status: 500 }
      );
    }

    // Strip sensitive fields for field workers
    const sanitized = isFieldWorker
      ? (jobOrders || []).map((j: any) => { const { difficulty_rating, estimated_cost, ...rest } = j; return rest; })
      : (jobOrders || []);

    return NextResponse.json(
      {
        success: true,
        data: sanitized,
        user_role: profile?.role,
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
