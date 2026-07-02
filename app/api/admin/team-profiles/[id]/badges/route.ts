export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const { id: operatorId } = await params;
  const tenantId = auth.tenantId;

  const { data, error } = await supabaseAdmin
    .from('operator_badges')
    .select('*')
    .eq('operator_id', operatorId)
    .eq('tenant_id', tenantId)
    .order('expiry_date', { ascending: true });
  if (error) return NextResponse.json({ error: 'Failed to fetch badges' }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const { id: operatorId } = await params;
  const tenantId = auth.tenantId;
  const body = await request.json();
  const { badge_type, badge_number, issued_date, expiry_date, notes } = body;

  if (!badge_type) return NextResponse.json({ error: 'badge_type is required' }, { status: 400 });

  // Verify the target operator belongs to the caller's tenant before attaching a badge.
  const { data: operatorProfile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id')
    .eq('id', operatorId)
    .maybeSingle();
  if (!operatorProfile || operatorProfile.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('operator_badges')
    .insert({
      operator_id: operatorId,
      tenant_id: tenantId,
      badge_type,
      badge_number: badge_number || null,
      issued_date: issued_date || null,
      expiry_date: expiry_date || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Failed to add badge' }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const { id: operatorId } = await params;
  const tenantId = auth.tenantId;
  const { badgeId } = await request.json();

  if (!badgeId) return NextResponse.json({ error: 'badgeId is required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('operator_badges')
    .delete()
    .eq('id', badgeId)
    .eq('operator_id', operatorId)
    .eq('tenant_id', tenantId);
  if (error) return NextResponse.json({ error: 'Failed to delete badge' }, { status: 500 });
  return NextResponse.json({ success: true });
}
