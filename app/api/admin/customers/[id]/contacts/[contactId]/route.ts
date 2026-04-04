export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/customers/[id]/contacts/[contactId]
 * PATCH: Update a contact
 * DELETE: Delete a contact
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id, contactId } = await params;
    const body = await request.json();

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    const allowedFields = ['name', 'email', 'phone', 'role', 'is_primary', 'is_billing_contact', 'notes'];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const { data: contact, error } = await supabaseAdmin
      .from('customer_contacts')
      .update(updateData)
      .eq('id', contactId)
      .eq('customer_id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating contact:', error);
      return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: contact });
  } catch (error) {
    console.error('Unexpected error in contact PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id, contactId } = await params;

    const { error } = await supabaseAdmin
      .from('customer_contacts')
      .delete()
      .eq('id', contactId)
      .eq('customer_id', id);

    if (error) {
      console.error('Error deleting contact:', error);
      return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in contact DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
