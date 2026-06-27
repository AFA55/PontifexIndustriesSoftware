export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/mark-read
 * Mark notifications as read.
 * Accepts: { notification_ids: string[] }, { mark_all: true }, or { types: string[] }.
 * The `types` mode powers "smart" auto-acknowledge — e.g. opening the time-edit
 * review page clears the caller's unread `timecard_review` bell items without
 * clicking each one. Always scoped to the caller (auth.userId).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { notification_ids, mark_all, types } = body;

    if (mark_all) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true, read: true, updated_at: new Date().toISOString() })
        .eq('user_id', auth.userId)
        .eq('is_read', false);

      if (error) {
        console.error('Error marking all notifications read:', error);
        return NextResponse.json({ error: 'Failed to mark notifications read' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'All notifications marked as read' });
    }

    if (notification_ids && Array.isArray(notification_ids) && notification_ids.length > 0) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true, read: true, updated_at: new Date().toISOString() })
        .eq('user_id', auth.userId)
        .in('id', notification_ids);

      if (error) {
        console.error('Error marking notifications read:', error);
        return NextResponse.json({ error: 'Failed to mark notifications read' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: `${notification_ids.length} notification(s) marked as read` });
    }

    // "Smart" auto-acknowledge by event type (caller-scoped). Used when an admin
    // opens the page that resolves these notifications — the bell clears even for
    // items they never individually clicked.
    if (types && Array.isArray(types) && types.length > 0) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true, read: true, updated_at: new Date().toISOString() })
        .eq('user_id', auth.userId)
        .eq('is_read', false)
        .in('type', types);

      if (error) {
        console.error('Error marking notifications read by type:', error);
        return NextResponse.json({ error: 'Failed to mark notifications read' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Matching notifications marked as read' });
    }

    return NextResponse.json(
      { error: 'Provide notification_ids array, types array, or mark_all: true' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Unexpected error in mark-read POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
