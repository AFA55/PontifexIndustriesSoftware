/**
 * API Route: GET /api/admin/facilities/[id] — Get single facility
 * API Route: PATCH /api/admin/facilities/[id] — Update facility
 * API Route: DELETE /api/admin/facilities/[id] — Soft delete (set is_active=false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    const { id } = await params;

    let query = supabaseAdmin
      .from('facilities')
      .select('*')
      .eq('id', id);
    if (tenantId) { query = query.eq('tenant_id', tenantId); }
    const { data, error } = await query.single();

    if (error || !data) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/facilities/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    const { id } = await params;
    const body = await request.json();

    const allowedFields = ['name', 'address', 'city', 'state', 'zip', 'special_requirements', 'orientation_required', 'badging_required', 'compliance_documents', 'notes', 'is_active'];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    let updateQuery = supabaseAdmin
      .from('facilities')
      .update(updates)
      .eq('id', id);
    if (tenantId) { updateQuery = updateQuery.eq('tenant_id', tenantId); }
    const { data, error } = await updateQuery.select().single();

    if (error) {
      console.error('Error updating facility:', error);
      return NextResponse.json({ error: 'Failed to update facility' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/admin/facilities/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    const { id } = await params;

    // Soft delete — set is_active to false
    let deleteQuery = supabaseAdmin
      .from('facilities')
      .update({ is_active: false })
      .eq('id', id);
    if (tenantId) { deleteQuery = deleteQuery.eq('tenant_id', tenantId); }
    const { data, error } = await deleteQuery.select().single();

    if (error) {
      console.error('Error deactivating facility:', error);
      return NextResponse.json({ error: 'Failed to deactivate facility' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/admin/facilities/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
