export const dynamic = 'force-dynamic';

/**
 * Auto-dispatch toggle for the current tenant (features.auto_dispatch).
 * GET  → { enabled } ; POST { enabled: boolean } → set it.
 * When ON, the /api/cron/auto-dispatch cron dispatches this tenant's tickets at
 * 7:05am local time. When OFF, dispatch is manual ("Push Tickets") only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const auth = await requireScheduleBoardAccess(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ success: true, enabled: false });

  const { data } = await supabaseAdmin
    .from('tenants')
    .select('features')
    .eq('id', auth.tenantId)
    .maybeSingle();
  const enabled = (data?.features as Record<string, unknown> | null)?.auto_dispatch === true;
  return NextResponse.json({ success: true, enabled });
}

export async function POST(request: NextRequest) {
  const auth = await requireScheduleBoardAccess(request);
  if (!auth.authorized) return auth.response;
  if (!['super_admin', 'operations_manager', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant scope required.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const enabled = body?.enabled === true;

  const { data: t } = await supabaseAdmin
    .from('tenants')
    .select('features')
    .eq('id', auth.tenantId)
    .maybeSingle();
  const features = { ...((t?.features as Record<string, unknown>) || {}), auto_dispatch: enabled };

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ features })
    .eq('id', auth.tenantId);
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });

  return NextResponse.json({ success: true, enabled });
}
