export const dynamic = 'force-dynamic';

/**
 * DELETE /api/command-center/conversations/[id]
 *
 * Deletes a conversation the caller owns; artifex_messages cascade-delete via
 * the FK (see supabase/migrations/20260702_artifex_memory.sql). Tenant+user
 * scoped in the query itself — supabaseAdmin bypasses RLS, so this filter is
 * the actual ownership check, not a redundant one.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { COMMAND_CENTER_ROLES } from '@/lib/rbac';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  if (!COMMAND_CENTER_ROLES.includes(auth.role)) {
    return NextResponse.json(
      { error: 'Forbidden. Command Center access required.' },
      { status: 403 }
    );
  }

  const tenantId = auth.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: 'Forbidden. Tenant not set for this user.' }, { status: 403 });
  }

  const { id } = await params;

  const { error, count } = await supabaseAdmin
    .from('artifex_conversations')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('user_id', auth.userId);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete conversation.' }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
