/**
 * API Route: POST/GET /api/admin/job-orders
 * Create new job orders and retrieve all job orders (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// GET: Fetch all job orders (admin only)
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

    // Get user's role from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user role' },
        { status: 403 }
      );
    }

    // Check if user is admin
    if (profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only administrators can view all job orders' },
        { status: 403 }
      );
    }

    // Get query parameters for filtering
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const assignedTo = searchParams.get('assignedTo');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build query directly from job_orders table
    let query = supabaseAdmin
      .from('job_orders')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (assignedTo) {
      query = query.eq('assigned_to', assignedTo);
    }

    if (startDate) {
      query = query.gte('scheduled_date', startDate);
    }

    if (endDate) {
      query = query.lte('scheduled_date', endDate);
    }

    const { data: jobOrders, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching job orders:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch job orders', details: fetchError.message },
        { status: 500 }
      );
    }

    // Calculate summary statistics
    const totalJobs = jobOrders?.length || 0;
    const statusCounts = jobOrders?.reduce((acc: any, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {}) || {};

    const avgDriveTime = jobOrders?.filter(j => j.drive_time).reduce((sum, j) => sum + (j.drive_time || 0), 0) / (jobOrders?.filter(j => j.drive_time).length || 1);
    const avgProductionTime = jobOrders?.filter(j => j.production_time).reduce((sum, j) => sum + (j.production_time || 0), 0) / (jobOrders?.filter(j => j.production_time).length || 1);

    return NextResponse.json(
      {
        success: true,
        data: {
          jobOrders: jobOrders || [],
          summary: {
            totalJobs,
            statusCounts,
            avgDriveTimeMinutes: Math.round(avgDriveTime || 0),
            avgProductionTimeMinutes: Math.round(avgProductionTime || 0),
          },
        },
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

// POST: Create new job order (admin only)
export async function POST(request: NextRequest) {
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

    // Get user's role from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user role' },
        { status: 403 }
      );
    }

    // Check if user is admin
    if (profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only administrators can create job orders' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.job_number || !body.title || !body.customer_name || !body.job_type || !body.location || !body.address) {
      return NextResponse.json(
        { error: 'Missing required fields: job_number, title, customer_name, job_type, location, address' },
        { status: 400 }
      );
    }

    // Prepare job order data
    const jobOrderData: any = {
      job_number: body.job_number,
      title: body.title,
      customer_name: body.customer_name,
      customer_contact: body.customer_contact,
      job_type: body.job_type,
      location: body.location,
      address: body.address,
      description: body.description,
      assigned_to: body.assigned_to || null,
      foreman_name: body.foreman_name,
      foreman_phone: body.foreman_phone,
      salesman_name: body.salesman_name,
      status: body.assigned_to ? 'assigned' : 'scheduled',
      priority: body.priority || 'medium',
      scheduled_date: body.scheduled_date,
      arrival_time: body.arrival_time,
      shop_arrival_time: body.shop_arrival_time,
      estimated_hours: body.estimated_hours,
      required_documents: body.required_documents || [],
      equipment_needed: body.equipment_needed || [],
      special_equipment: body.special_equipment || [],
      job_site_number: body.job_site_number,
      po_number: body.po_number,
      customer_job_number: body.customer_job_number,
      created_by: user.id,
    };

    // Set assigned_at if assigning to operator
    if (body.assigned_to) {
      jobOrderData.assigned_at = new Date().toISOString();
    }

    // Insert job order
    const { data: jobOrder, error: insertError } = await supabaseAdmin
      .from('job_orders')
      .insert(jobOrderData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating job order:', insertError);
      return NextResponse.json(
        { error: 'Failed to create job order', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Job order created successfully',
        data: jobOrder,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Unexpected error in create job order route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
