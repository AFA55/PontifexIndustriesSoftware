export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/customers/[id]
 * GET: Full customer detail with contacts, job history, revenue stats
 * PATCH: Update customer fields
 * DELETE: Delete customer (super_admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    const { id } = await params;

    // Fetch customer
    let customerQuery = supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', id);
    if (tenantId) { customerQuery = customerQuery.eq('tenant_id', tenantId); }
    const { data: customer, error: customerError } = await customerQuery.single();

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Fetch contacts
    const { data: contacts } = await supabaseAdmin
      .from('customer_contacts')
      .select('*')
      .eq('customer_id', id)
      .order('is_primary', { ascending: false })
      .order('name', { ascending: true });

    // Fetch job history
    const { data: jobs } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, title, job_type, status, scheduled_date, end_date, estimated_cost, created_at')
      .eq('customer_id', id)
      .order('scheduled_date', { ascending: false });

    // Calculate revenue stats
    const totalRevenue = (jobs || []).reduce((sum, j) => sum + (parseFloat(j.estimated_cost) || 0), 0);
    const activeJobs = (jobs || []).filter(j => !['completed', 'cancelled', 'invoiced'].includes(j.status)).length;

    return NextResponse.json({
      success: true,
      data: {
        ...customer,
        contacts: contacts || [],
        jobs: jobs || [],
        stats: {
          total_jobs: (jobs || []).length,
          total_revenue: totalRevenue,
          active_jobs: activeJobs,
        },
      },
    });
  } catch (error) {
    console.error('Unexpected error in customer GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Map allowed fields
    const allowedFields: Record<string, string> = {
      company_name: 'name',
      primary_contact_name: 'primary_contact_name',
      primary_contact_email: 'primary_contact_email',
      primary_contact_phone: 'primary_contact_phone',
      billing_contact_name: 'billing_contact_name',
      billing_contact_email: 'billing_contact_email',
      billing_contact_phone: 'billing_contact_phone',
      address: 'address',
      city: 'city',
      state: 'state',
      zip: 'zip',
      customer_type: 'customer_type',
      payment_terms: 'payment_terms',
      payment_method: 'payment_method',
      tax_id: 'tax_id',
      website: 'website',
      notes: 'notes',
      is_active: 'is_active',
    };

    for (const [bodyKey, dbKey] of Object.entries(allowedFields)) {
      if (body[bodyKey] !== undefined) {
        updateData[dbKey] = body[bodyKey];
        // Keep name and display_name in sync
        if (bodyKey === 'company_name') {
          updateData['display_name'] = body[bodyKey];
        }
        // Keep active and is_active in sync
        if (bodyKey === 'is_active') {
          updateData['active'] = body[bodyKey];
        }
      }
    }

    const tenantId = await getTenantId(auth.userId);

    let updateQuery = supabaseAdmin
      .from('customers')
      .update(updateData)
      .eq('id', id);
    if (tenantId) { updateQuery = updateQuery.eq('tenant_id', tenantId); }
    const { data: customer, error } = await updateQuery.select().single();

    if (error) {
      console.error('Error updating customer:', error);
      return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: customer });
  } catch (error) {
    console.error('Unexpected error in customer PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    const { id } = await params;

    // Unlink job_orders first
    await supabaseAdmin
      .from('job_orders')
      .update({ customer_id: null })
      .eq('customer_id', id);

    let deleteQuery = supabaseAdmin
      .from('customers')
      .delete()
      .eq('id', id);
    if (tenantId) { deleteQuery = deleteQuery.eq('tenant_id', tenantId); }
    const { error } = await deleteQuery;

    if (error) {
      console.error('Error deleting customer:', error);
      return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in customer DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
