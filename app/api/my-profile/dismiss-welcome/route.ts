export const dynamic = 'force-dynamic';

/**
 * POST /api/my-profile/dismiss-welcome
 *
 * Permanently silences the "Finish your profile" welcome nudge for the caller by
 * stamping profiles.welcome_dismissed_at. Self-scoped (auth.userId). Idempotent:
 * calling again just re-stamps. Any authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ welcome_dismissed_at: new Date().toISOString() })
    .eq('id', auth.userId);

  if (error) {
    return NextResponse.json({ error: 'Could not dismiss welcome' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
