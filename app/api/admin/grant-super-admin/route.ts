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

  // Update profiles table ONLY — this is the authoritative source for roles.
  // NEVER write role to user_metadata: it is client-writable via supabase.auth.updateUser()
  // and any operator could self-promote. RLS helpers read from public.profiles exclusively.
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ role: 'super_admin' })
    .eq('id', userId);

  if (error) {
    console.error('Error granting super admin:', error);
    return NextResponse.json({ error: 'Failed to update user role' }, { status: 500 });
  }

  // Fire-and-forget audit log — REAL audit_logs columns
  // (user_id / user_email / user_role / action / resource_* / details / tenant_id).
  // user_email, user_role, resource_type are NOT NULL; omitting them silently failed the insert.
  Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      user_id: auth.userId,
      user_email: auth.userEmail,
      user_role: auth.role,
      action: 'grant_super_admin',
      resource_type: 'profile',
      resource_id: userId,
      tenant_id: auth.tenantId,
      details: { granted_by: auth.userId, granted_to: userId },
    })
  ).catch(() => {});

  return NextResponse.json({ success: true });
}
