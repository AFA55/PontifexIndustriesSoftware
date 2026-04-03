export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  if (auth.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'Only super admins can grant super admin access' },
      { status: 403 }
    );
  }

  const { userId } = (await request.json()) as { userId: string };

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  // Update user_metadata role in auth.users
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: { role: 'super_admin' },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
