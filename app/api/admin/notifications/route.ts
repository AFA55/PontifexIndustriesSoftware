/**
 * GET /api/admin/notifications
 * Fetch unread notifications for the current user (admin/salesman/supervisor).
 *
 * PATCH /api/admin/notifications
 * Mark notifications as read.
 *
 * Access: Any authenticated user with admin dashboard access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread') !== 'false';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

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

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Unexpected error in notifications GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { notificationIds, markAllRead } = body;

    if (markAllRead) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true, read: true, updated_at: new Date().toISOString() })
        .eq('user_id', auth.userId)
        .eq('is_read', false);

      if (error) {
        console.error('Error marking all notifications read:', error);
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
      }
    } else if (notificationIds && Array.isArray(notificationIds)) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true, read: true, updated_at: new Date().toISOString() })
        .eq('user_id', auth.userId)
        .in('id', notificationIds);

      if (error) {
        console.error('Error marking notifications read:', error);
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'Provide notificationIds array or markAllRead: true' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in notifications PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
