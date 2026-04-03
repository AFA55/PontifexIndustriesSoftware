export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const { userId } = await params;

  const { data, error } = await supabaseAdmin
    .from('user_feature_flags')
    .select('*')
    .eq('user_id', userId)
    .eq('tenant_id', auth.tenantId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data || null });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  // Only super_admin or operations_manager can set flags
  if (!['super_admin', 'operations_manager'].includes(auth.role || '')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { userId } = await params;
  const body = await request.json();

  const { data, error } = await supabaseAdmin
    .from('user_feature_flags')
    .upsert(
      {
        user_id: userId,
        tenant_id: auth.tenantId,
        ...body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tenant_id' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
