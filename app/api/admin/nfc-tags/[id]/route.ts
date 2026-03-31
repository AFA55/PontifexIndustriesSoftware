/**
 * PATCH /api/admin/nfc-tags/[id] — Update a specific NFC tag (label, is_active, tag_type, etc.)
 * DELETE /api/admin/nfc-tags/[id] — Delete a specific NFC tag
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Tag ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { label, is_active, tag_type, truck_number, jobsite_address } = body;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof label === 'string') updates.label = label;
    if (typeof is_active === 'boolean') updates.is_active = is_active;
    if (typeof tag_type === 'string') updates.tag_type = tag_type;
    if (typeof truck_number === 'string') updates.truck_number = truck_number || null;
    if (typeof jobsite_address === 'string') updates.jobsite_address = jobsite_address || null;

    let updateQuery = supabaseAdmin
      .from('nfc_tags')
      .update(updates)
      .eq('id', id);
    if (auth.tenantId) updateQuery = updateQuery.eq('tenant_id', auth.tenantId);

    const { data, error } = await updateQuery
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'NFC tag not found' }, { status: 404 });
      }
      console.error('Error updating NFC tag:', error);
      return NextResponse.json({ error: 'Failed to update NFC tag' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/admin/nfc-tags/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Tag ID is required' }, { status: 400 });
    }

    // Fetch the tag first so we can return the label in the response
    let fetchQuery = supabaseAdmin
      .from('nfc_tags')
      .select('id, label, tag_uid')
      .eq('id', id);
    if (auth.tenantId) fetchQuery = fetchQuery.eq('tenant_id', auth.tenantId);
    const { data: tag } = await fetchQuery.maybeSingle();

    if (!tag) {
      return NextResponse.json({ error: 'NFC tag not found' }, { status: 404 });
    }

    let deleteQuery = supabaseAdmin
      .from('nfc_tags')
      .delete()
      .eq('id', id);
    if (auth.tenantId) deleteQuery = deleteQuery.eq('tenant_id', auth.tenantId);
    const { error } = await deleteQuery;

    if (error) {
      console.error('Error deleting NFC tag:', error);
      return NextResponse.json({ error: 'Failed to delete NFC tag' }, { status: 500 });
    }

    // Audit log (fire-and-forget)
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'nfc_tag_deleted',
        entity_type: 'nfc_tag',
        entity_id: id,
        metadata: { label: tag.label },
        tenant_id: auth.tenantId || null,
      })
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `NFC tag "${tag.label}" deleted successfully`,
    });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/admin/nfc-tags/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
