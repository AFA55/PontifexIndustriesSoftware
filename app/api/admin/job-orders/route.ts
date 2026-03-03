/**
 * API Route: POST/GET /api/admin/job-orders
 * Create new job orders and retrieve all job orders (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

// GET: Fetch job orders with pagination (admin only)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Get query parameters for filtering and pagination
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const assignedTo = searchParams.get('assignedTo');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10)));

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Count query (with same filters) for total
    let countQuery = supabaseAdmin
      .from('job_orders')
      .select('*', { count: 'exact', head: true });

    if (status) countQuery = countQuery.eq('status', status);
    if (assignedTo) countQuery = countQuery.eq('assigned_to', assignedTo);
    if (startDate) countQuery = countQuery.gte('scheduled_date', startDate);
    if (endDate) countQuery = countQuery.lte('scheduled_date', endDate);

    const { count: total, error: countError } = await countQuery;

    if (countError) {
      console.error('Error counting job orders:', countError);
      return NextResponse.json(
        { error: 'Failed to fetch job orders' },
        { status: 500 }
      );
    }

    // Build data query
    let query = supabaseAdmin
      .from('job_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

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
        { error: 'Failed to fetch job orders' },
        { status: 500 }
      );
    }

    // Calculate summary statistics from current page data
    const totalJobs = jobOrders?.length || 0;
    const statusCounts = jobOrders?.reduce((acc: any, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {}) || {};

    const avgDriveTime = jobOrders?.filter(j => j.drive_time).reduce((sum, j) => sum + (j.drive_time || 0), 0) / (jobOrders?.filter(j => j.drive_time).length || 1);
    const avgProductionTime = jobOrders?.filter(j => j.production_time).reduce((sum, j) => sum + (j.production_time || 0), 0) / (jobOrders?.filter(j => j.production_time).length || 1);

    const totalCount = total ?? 0;
    const totalPages = Math.ceil(totalCount / pageSize);

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
          pagination: {
            page,
            pageSize,
            total: totalCount,
            totalPages,
          },
        },
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

// POST: Create new job order (admin only)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

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
      customer_email: body.customer_email || null,
      salesperson_email: body.salesperson_email || null,
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
      job_quote: body.job_quote || null,
      difficulty_rating: body.difficulty_rating || null,
      truck_distance_to_work: body.truck_parking || null,
      work_environment: body.work_environment || null,
      site_cleanliness: body.site_cleanliness || null,
      created_by: auth.userId,
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
        { error: 'Failed to create job order' },
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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
