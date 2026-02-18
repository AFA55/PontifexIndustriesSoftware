/**
 * API Route: GET/POST /api/admin/customers
 * Manage customers (admin only)
 *
 * GET  - List customers with optional filtering by active status and search
 * POST - Create a new customer
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAudit, getRequestContext } from '@/lib/audit';

// GET: Fetch customers with optional filters
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const active = searchParams.get('active') ?? 'true';
    const search = searchParams.get('search');

    // Build query
    let query = supabaseAdmin
      .from('customers')
      .select('*')
      .order('name', { ascending: true });

    // Filter by active status
    if (active === 'true') {
      query = query.eq('active', true);
    } else if (active === 'false') {
      query = query.eq('active', false);
    }
    // If active is 'all' or any other value, no filter is applied

    // Search by name (case insensitive)
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data: customers, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching customers:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch customers' },
        { status: 500 }
      );
    }

    // Calculate summary statistics
    const total = customers?.length || 0;
    const activeCount = customers?.filter(c => c.active).length || 0;
    const withBalance = customers?.filter(c => (c.outstanding_balance || 0) > 0).length || 0;

    return NextResponse.json(
      {
        success: true,
        data: {
          customers: customers || [],
          summary: {
            total,
            active: activeCount,
            withBalance,
          },
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in customers GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create a new customer
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { error: 'Customer name is required' },
        { status: 400 }
      );
    }

    const trimmedName = body.name.trim();

    // Check for duplicate customer name (case insensitive)
    const { data: existing, error: dupError } = await supabaseAdmin
      .from('customers')
      .select('id, name')
      .ilike('name', trimmedName)
      .limit(1);

    if (dupError) {
      console.error('Error checking duplicate customer:', dupError);
      return NextResponse.json(
        { error: 'Failed to validate customer name' },
        { status: 500 }
      );
    }

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `A customer with the name "${existing[0].name}" already exists` },
        { status: 409 }
      );
    }

    // Prepare customer data
    const customerData: Record<string, any> = {
      name: trimmedName,
      display_name: body.display_name || null,
      primary_contact_name: body.primary_contact_name || null,
      primary_contact_email: body.primary_contact_email || null,
      primary_contact_phone: body.primary_contact_phone || null,
      billing_contact_name: body.billing_contact_name || null,
      billing_contact_email: body.billing_contact_email || null,
      billing_address_line1: body.billing_address_line1 || null,
      billing_address_line2: body.billing_address_line2 || null,
      billing_city: body.billing_city || null,
      billing_state: body.billing_state || null,
      billing_zip: body.billing_zip || null,
      payment_terms: body.payment_terms || null,
      default_billing_type: body.default_billing_type || null,
      tax_exempt: body.tax_exempt ?? false,
      tax_id: body.tax_id || null,
      notes: body.notes || null,
      created_by: auth.userId,
    };

    // Insert customer
    const { data: customer, error: insertError } = await supabaseAdmin
      .from('customers')
      .insert(customerData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating customer:', insertError);
      return NextResponse.json(
        { error: 'Failed to create customer' },
        { status: 500 }
      );
    }

    // Audit log
    const ctx = getRequestContext(request);
    await logAudit({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: 'create',
      entityType: 'customer',
      entityId: customer?.id,
      description: `Created customer "${trimmedName}"`,
      ...ctx,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Customer created successfully',
        data: customer,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Unexpected error in customers POST route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
