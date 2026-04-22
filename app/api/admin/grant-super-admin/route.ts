export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { userId } = (await request.json()) as { userId: string };

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  // Verify the target user belongs to the same tenant (prevent cross-tenant privilege escalation)
  const { data: targetProfile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id')
    .eq('id', userId)
    .maybeSingle();

  if (!targetProfile || targetProfile.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: 'User not found in your organization' }, { status: 404 });
  }

  // Update user_metadata role in auth.users
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: { role: 'super_admin' },
  });

  if (error) {
    console.error('Error granting super admin:', error);
    return NextResponse.json({ error: 'Failed to update user role' }, { status: 500 });
  }

  // Also update profiles table
  await supabaseAdmin
    .from('profiles')
    .update({ role: 'super_admin' })
    .eq('id', userId);

  // Fire-and-forget audit log
  Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      action: 'grant_super_admin',
      actor_id: auth.userId,
      target_id: userId,
      tenant_id: auth.tenantId,
      details: { granted_by: auth.userId, granted_to: userId },
    })
  ).catch(() => {});

  return NextResponse.json({ success: true });
}
