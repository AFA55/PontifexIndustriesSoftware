export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/customers/[id]/contacts
 * GET: List contacts for a customer
 * POST: Add a new contact
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSalesStaff } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const { id } = await params;

    // Verify customer belongs to tenant
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    {
      const { data: customer } = await supabaseAdmin.from('customers').select('id').eq('id', id).eq('tenant_id', tenantId).single();
      if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const { data: contacts, error } = await supabaseAdmin
      .from('customer_contacts')
      .select('*')
      .eq('customer_id', id)
      .order('is_primary', { ascending: false })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching contacts:', error);
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: contacts || [] });
  } catch (error) {
    console.error('Unexpected error in contacts GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const { id } = await params;
    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
    }

    // Verify customer belongs to tenant
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    {
      const { data: customer } = await supabaseAdmin.from('customers').select('id').eq('id', id).eq('tenant_id', tenantId).single();
      if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const insertData = {
      customer_id: id,
      name: body.name.trim(),
      email: body.email || null,
      phone: body.phone || null,
      role: body.role || null,
      is_primary: body.is_primary || false,
      is_billing_contact: body.is_billing_contact || false,
      notes: body.notes || null,
    };

    const { data: contact, error } = await supabaseAdmin
      .from('customer_contacts')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating contact:', error);
      return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: contact }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in contacts POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
