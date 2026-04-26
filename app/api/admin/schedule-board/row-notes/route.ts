export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

// GET: fetch row notes for a date (returns all operators for that date)
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const tenantId = await getTenantId(auth.userId);
  const date = request.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });

  const query = supabaseAdmin.from('operator_row_notes').select('id, operator_id, date, note, updated_at').eq('date', date);
  const { data, error } = tenantId ? await query.eq('tenant_id', tenantId) : await query;
  if (error) return NextResponse.json({ error: 'Failed to fetch row notes' }, { status: 500 });
  return NextResponse.json({ success: true, data: data || [] });
}

// POST: upsert a row note (creates or updates for operator+date)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const tenantId = await getTenantId(auth.userId);
  const body = await request.json();
  const { operator_id, date, note } = body;
  if (!operator_id || !date) return NextResponse.json({ error: 'operator_id and date required' }, { status: 400 });

  const payload: any = { operator_id, date, note: note || '', updated_by: auth.userId, updated_at: new Date().toISOString() };
  if (tenantId) payload.tenant_id = tenantId;

  // Try update first, then insert
  const { data: existing } = await supabaseAdmin.from('operator_row_notes').select('id').eq('operator_id', operator_id).eq('date', date).maybeSingle();
  if (existing) {
    const { data, error } = await supabaseAdmin.from('operator_row_notes').update(payload).eq('id', existing.id).select('id, operator_id, date, note').single();
    if (error) return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } else {
    payload.created_by = auth.userId;
    const { data, error } = await supabaseAdmin.from('operator_row_notes').insert(payload).select('id, operator_id, date, note').single();
    if (error) return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    return NextResponse.json({ success: true, data }, { status: 201 });
  }
}

// DELETE: remove a row note by id
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const tenantId = await getTenantId(auth.userId);
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const q = supabaseAdmin.from('operator_row_notes').delete().eq('id', id);
  const { error } = tenantId ? await q.eq('tenant_id', tenantId) : await q;
  if (error) return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  return NextResponse.json({ success: true });
}
