export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/mark-read
 * Mark notifications as read.
 * Accepts: { notification_ids: string[] } or { mark_all: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { notification_ids, mark_all } = body;

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

    return NextResponse.json(
      { error: 'Provide notification_ids array or mark_all: true' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Unexpected error in mark-read POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
