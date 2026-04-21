export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/schedule-board/time-off
 * GET: fetch time-off entries for a date or date range
 * POST: create a time-off entry
 * DELETE: delete a time-off entry by id
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const date = request.nextUrl.searchParams.get('date');
    const startDate = request.nextUrl.searchParams.get('startDate');
    const endDate = request.nextUrl.searchParams.get('endDate');

    let query = supabaseAdmin
      .from('operator_time_off')
      .select('id, operator_id, date, type, notes, approved_by, created_at, profiles:operator_id(full_name)')
      .order('date', { ascending: true });

    query = query.eq('tenant_id', tenantId);

    if (date) {
      query = query.eq('date', date);
    } else if (startDate && endDate) {
      query = query.gte('date', startDate).lte('date', endDate);
    } else {
      return NextResponse.json({ error: 'Must provide date or startDate+endDate' }, { status: 400 });
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching time-off:', error);
      return NextResponse.json({ error: 'Failed to fetch time-off entries' }, { status: 500 });
    }

    // Flatten the joined profile name
    const entries = (data || []).map((entry: any) => ({
      id: entry.id,
      operator_id: entry.operator_id,
      operator_name: entry.profiles?.full_name || 'Unknown',
      date: entry.date,
      type: entry.type,
      notes: entry.notes,
      approved_by: entry.approved_by,
      created_at: entry.created_at,
    }));

    return NextResponse.json({ success: true, data: entries });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/schedule-board/time-off:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const body = await request.json();
    const { operator_id, date, type, notes } = body;

    if (!operator_id || !date || !type) {
      return NextResponse.json({ error: 'Missing required fields: operator_id, date, type' }, { status: 400 });
    }

    const validTypes = ['pto', 'unpaid', 'worked_last_night', 'sick', 'other'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('operator_time_off')
      .insert({
        operator_id,
        date,
        type,
        notes: notes || null,
        approved_by: auth.userId,
        created_by: auth.userId,
        tenant_id: tenantId || null,
      })
      .select('id, operator_id, date, type, notes, created_at')
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Time-off entry already exists for this operator on this date' }, { status: 409 });
      }
      console.error('Error creating time-off:', error);
      return NextResponse.json({ error: 'Failed to create time-off entry' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/schedule-board/time-off:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });
    }

    let deleteQuery = supabaseAdmin
      .from('operator_time_off')
      .delete()
      .eq('id', id);
    deleteQuery = deleteQuery.eq('tenant_id', tenantId);
    const { error } = await deleteQuery;

    if (error) {
      console.error('Error deleting time-off:', error);
      return NextResponse.json({ error: 'Failed to delete time-off entry' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Time-off entry deleted' });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/admin/schedule-board/time-off:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
