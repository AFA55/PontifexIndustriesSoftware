export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications
 * Fetch notifications for the authenticated user.
 * Supports ?unread_only=true to filter only unread notifications.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 50);

    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching notifications:', error);
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    // Count unread
    const { count: unreadCount, error: countError } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', auth.userId)
      .eq('is_read', false);

    if (countError) {
      console.error('Error counting unread notifications:', countError);
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      unread_count: unreadCount || 0,
    });
  } catch (error) {
    console.error('Unexpected error in notifications GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/notifications — delete the caller's OWN notifications.
 * Body: { ids: string[] } to delete specific ones, or { clear_read: true }
 * to sweep everything already read (founder ask Jul 12). Scoped to
 * auth.userId — you can never delete another user's notifications.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    let body: any = {};
    try { body = await request.json(); } catch { /* empty body ok for clear_read via ids check */ }

    if (body?.clear_read === true) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .delete()
        .eq('user_id', auth.userId)
        .eq('is_read', true);
      if (error) return NextResponse.json({ error: 'Failed to clear notifications' }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 100) : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Provide ids[] or clear_read: true' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from('notifications')
      .delete()
      .in('id', ids)
      .eq('user_id', auth.userId);
    if (error) return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
