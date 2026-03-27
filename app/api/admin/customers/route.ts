/**
 * API Route: /api/admin/customers
 * GET: List customers with search, pagination, job_count, total_revenue
 * POST: Create a new customer
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    // Build base query
    let query = supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    const { data: customers, error, count } = await query;

    if (error) {
      console.error('Error fetching customers:', error);
      return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
    }

    // For each customer, get job_count and total_revenue
    const enriched = await Promise.all(
      (customers || []).map(async (customer) => {
        const { data: jobStats } = await supabaseAdmin
          .from('job_orders')
          .select('id, estimated_cost')
          .eq('customer_id', customer.id);

        const job_count = jobStats?.length || 0;
        const total_revenue = jobStats?.reduce((sum, j) => sum + (parseFloat(j.estimated_cost) || 0), 0) || 0;

        return { ...customer, job_count, total_revenue };
      })
    );

    return NextResponse.json({
      success: true,
      data: enriched,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('Unexpected error in customers GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();

    if (!body.company_name?.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const insertData: Record<string, any> = {
      name: body.company_name.trim(),
      display_name: body.company_name.trim(),
      primary_contact_name: body.primary_contact_name || null,
      primary_contact_email: body.primary_contact_email || null,
      primary_contact_phone: body.primary_contact_phone || null,
      billing_contact_name: body.billing_contact_name || null,
      billing_contact_email: body.billing_contact_email || null,
      billing_contact_phone: body.billing_contact_phone || null,
      address: body.address || null,
      city: body.city || null,
      state: body.state || null,
      zip: body.zip || null,
      customer_type: body.customer_type || null,
      payment_terms: body.payment_terms === 'cod' ? body.payment_terms : (body.payment_terms ? parseInt(body.payment_terms, 10) || null : null),
      payment_method: body.payment_method || null,
      tax_id: body.tax_id || null,
      website: body.website || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      active: body.is_active !== undefined ? body.is_active : true,
      created_by: auth.userId,
    };

    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating customer:', error);
      return NextResponse.json({ error: 'Failed to create customer', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: customer }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in customers POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
