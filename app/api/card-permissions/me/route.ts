/**
 * API Route: GET /api/card-permissions/me
 * Get the current authenticated user's dashboard card permissions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

// GET: Current user's card permissions
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { data: permissions, error } = await supabaseAdmin
      .from('user_card_permissions')
      .select('*')
      .eq('user_id', auth.userId)
      .order('card_key', { ascending: true });

    if (error) {
      console.error('[card-permissions/me GET] Fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch card permissions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: permissions || [],
    });
  } catch (error: any) {
    console.error('[card-permissions/me GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
