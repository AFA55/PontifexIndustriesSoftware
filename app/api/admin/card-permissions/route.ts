/**
 * API Route: GET/POST /api/admin/card-permissions
 * Admin-only CRUD for dashboard card permissions per user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

// GET: Get card permissions for a specific user
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required query parameter: user_id' },
        { status: 400 }
      );
    }

    const { data: permissions, error } = await supabaseAdmin
      .from('user_card_permissions')
      .select('*')
      .eq('user_id', userId)
      .order('card_key', { ascending: true });

    if (error) {
      console.error('[admin/card-permissions GET] Fetch error:', error);
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
    console.error('[admin/card-permissions GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Set card permissions for a user (upsert)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();

    if (!body.user_id || !body.permissions || typeof body.permissions !== 'object') {
      return NextResponse.json(
        { error: 'Missing required fields: user_id, permissions (object)' },
        { status: 400 }
      );
    }

    const { user_id, permissions } = body;

    // Verify the user exists
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', user_id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Upsert each card_key -> visible mapping
    const upsertRows = Object.entries(permissions).map(([card_key, visible]) => ({
      user_id,
      card_key,
      visible: Boolean(visible),
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    }));

    if (upsertRows.length === 0) {
      return NextResponse.json(
        { error: 'No permissions provided' },
        { status: 400 }
      );
    }

    const { error: upsertError } = await supabaseAdmin
      .from('user_card_permissions')
      .upsert(upsertRows, {
        onConflict: 'user_id,card_key',
      });

    if (upsertError) {
      console.error('[admin/card-permissions POST] Upsert error:', upsertError);
      return NextResponse.json(
        { error: 'Failed to update card permissions' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[admin/card-permissions POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
