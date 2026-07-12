export const dynamic = 'force-dynamic';

/**
 * GET /api/command-center/conversations
 *
 * Lists the caller's own Artifex conversations (id, title, updated_at), most
 * recent first — the conversation switcher for the "2nd brain" chat history.
 * Same auth gate as the assistant route: requireAuth + COMMAND_CENTER_ROLES.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { COMMAND_CENTER_ROLES } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  if (![...COMMAND_CENTER_ROLES, 'operator', 'apprentice'].includes(auth.role)) {
    return NextResponse.json(
      { error: 'Forbidden. Command Center access required.' },
      { status: 403 }
    );
  }

  const tenantId = auth.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: 'Forbidden. Tenant not set for this user.' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('artifex_conversations')
    .select('id, title, updated_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', auth.userId)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to load conversations.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}
