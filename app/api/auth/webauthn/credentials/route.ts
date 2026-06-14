export const dynamic = 'force-dynamic';

/**
 * GET    /api/auth/webauthn/credentials       — list the caller's passkeys
 * DELETE /api/auth/webauthn/credentials?id=…  — remove one of the caller's passkeys
 *
 * Self-scoped: always filtered to auth.userId so a user can only see/remove
 * their own passkeys (defense-in-depth on top of RLS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const { data, error } = await supabaseAdmin
    .from('webauthn_credentials')
    .select('id, nickname, device_type, backed_up, created_at, last_used_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Could not load passkeys' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing passkey id' }, { status: 400 });
  }

  // Scope the delete to the caller — they can never remove someone else's passkey.
  const { error } = await supabaseAdmin
    .from('webauthn_credentials')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.userId);

  if (error) {
    return NextResponse.json({ error: 'Could not remove passkey' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
