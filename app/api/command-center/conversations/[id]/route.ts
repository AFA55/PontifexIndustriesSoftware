export const dynamic = 'force-dynamic';

/**
 * GET /api/command-center/conversations/[id]
 *
 * Loads a conversation's full message history — used when the sidebar's
 * conversation switcher resumes a past chat. DELETE below removes one.
 * Both re-verify tenant+user ownership themselves; supabaseAdmin bypasses
 * RLS, so this filter is the actual ownership check, not a redundant one.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { COMMAND_CENTER_ROLES } from '@/lib/rbac';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from('artifex_conversations')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (conversationError) {
    return NextResponse.json({ error: 'Failed to load conversation.' }, { status: 500 });
  }
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  const { data: rows, error: messagesError } = await supabaseAdmin
    .from('artifex_messages')
    .select('id, role, parts')
    .eq('conversation_id', id)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  if (messagesError) {
    return NextResponse.json({ error: 'Failed to load messages.' }, { status: 500 });
  }

  const messages = (rows ?? []).map((row: any) => ({
    id: row.id,
    role: row.role,
    parts: row.parts,
  }));

  return NextResponse.json({ success: true, data: messages });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
