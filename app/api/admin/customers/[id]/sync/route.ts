/**
 * API Route: /api/admin/customers/[id]/sync
 * POST: Propagate customer info (name, contact, address) to all linked job_orders
 * Ensures that when you update a customer, all their jobs reflect the latest info.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    // Fetch customer
    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Find all job_orders linked to this customer
    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from('job_orders')
      .select('id')
      .eq('customer_id', id);

    if (jobsError || !jobs || jobs.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: 'No linked jobs to update' });
    }

    // Build update payload from customer data
    const updatePayload: Record<string, any> = {
      customer_name: customer.name || customer.display_name,
      updated_at: new Date().toISOString(),
    };

    // Propagate contact info if available
    if (customer.primary_contact_name) {
      updatePayload.customer_contact = customer.primary_contact_name;
    }
    if (customer.primary_contact_phone) {
      updatePayload.site_contact_phone = customer.primary_contact_phone;
    }

    // Update all linked jobs
    const { error: updateError, count } = await supabaseAdmin
      .from('job_orders')
      .update(updatePayload)
      .eq('customer_id', id);

    if (updateError) {
      console.error('Error syncing customer to jobs:', updateError);
      return NextResponse.json({ error: 'Failed to sync' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'customer_sync',
        resource_type: 'customer',
        resource_id: id,
        details: { jobs_updated: jobs.length, customer_name: customer.name },
      })
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      updated: jobs.length,
      message: `Updated ${jobs.length} job(s) with latest customer info`,
    });
  } catch (error) {
    console.error('Unexpected error in customer sync:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
