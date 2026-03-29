/**
 * API Route: GET/PUT /api/admin/dashboard-layout
 * Persists per-user dashboard widget layout preferences.
 * Any authenticated user can save their own layout.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { data, error } = await supabaseAdmin
      .from('dashboard_layouts')
      .select('*')
      .eq('user_id', auth.userId)
      .single();

    if (error) {
      // If table doesn't exist yet or no row found, return null
      if (isTableNotFoundError(error) || error.code === 'PGRST116') {
        return NextResponse.json({ success: true, data: null });
      }
      console.error('Error fetching dashboard layout:', error);
      return NextResponse.json({ error: 'Failed to fetch layout' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in dashboard-layout GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { layout } = body;

    if (!layout || !Array.isArray(layout)) {
      return NextResponse.json({ error: 'layout must be an array' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('dashboard_layouts')
      .upsert(
        {
          user_id: auth.userId,
          layout,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) {
      if (isTableNotFoundError(error)) {
        return NextResponse.json(
          { error: 'Dashboard layouts table not yet created. Run the migration first.' },
          { status: 501 }
        );
      }
      console.error('Error saving dashboard layout:', error);
      return NextResponse.json({ error: 'Failed to save layout' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in dashboard-layout PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
