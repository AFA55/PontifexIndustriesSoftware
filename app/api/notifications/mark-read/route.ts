export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/mark-read
 * Mark notifications as read — across BOTH feed tables.
 *
 * Accepts (any combination):
 *   { notification_ids: string[] }             — personal `notifications` rows
 *   { schedule_ids: string[] }                 — `schedule_notifications` rows
 *   { items: [{ source, id }] }                — mixed-source pairs (source
 *                                                'schedule' | 'notifications';
 *                                                bare/unknown → 'notifications')
 *   { mark_all: true }                         — everything unread, both tables
 *   { types: string[] }                        — "smart" auto-acknowledge by
 *     event type (personal table only) — e.g. opening the time-edit review
 *     page clears the caller's unread `timecard_review` bell items.
 *
 * Always scoped to the caller (auth.userId).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { notification_ids, schedule_ids, items, mark_all, types } = body;
    const now = new Date().toISOString();

    if (mark_all) {
      const [personal, schedule] = await Promise.all([
        supabaseAdmin
          .from('notifications')
          .update({ is_read: true, read: true, updated_at: now })
          .eq('user_id', auth.userId)
          .eq('is_read', false),
        supabaseAdmin
          .from('schedule_notifications')
          .update({ read: true, read_at: now })
          .eq('recipient_id', auth.userId)
          .eq('read', false),
      ]);

      if (personal.error || schedule.error) {
        console.error('Error marking all notifications read:', personal.error || schedule.error);
        return NextResponse.json({ error: 'Failed to mark notifications read' }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: 'All notifications marked as read' });
    }

    // Collect ids per table from the array shapes + mixed {source,id} pairs.
    const personalIds = new Set<string>(
      Array.isArray(notification_ids)
        ? notification_ids.filter((x: unknown) => typeof x === 'string')
        : []
    );
    const scheduleIds = new Set<string>(
      Array.isArray(schedule_ids)
        ? schedule_ids.filter((x: unknown) => typeof x === 'string')
        : []
    );
    if (Array.isArray(items)) {
      for (const it of items) {
        if (!it || typeof it.id !== 'string') continue;
        if (it.source === 'schedule') scheduleIds.add(it.id);
        else personalIds.add(it.id);
      }
    }

    if (personalIds.size > 0 || scheduleIds.size > 0) {
      const ops: Promise<{ error: unknown }>[] = [];
      if (personalIds.size > 0) {
        ops.push(
          Promise.resolve(
            supabaseAdmin
              .from('notifications')
              .update({ is_read: true, read: true, updated_at: now })
              .eq('user_id', auth.userId)
              .in('id', Array.from(personalIds).slice(0, 100))
          )
        );
      }
      if (scheduleIds.size > 0) {
        ops.push(
          Promise.resolve(
            supabaseAdmin
              .from('schedule_notifications')
              .update({ read: true, read_at: now })
              .eq('recipient_id', auth.userId)
              .in('id', Array.from(scheduleIds).slice(0, 100))
          )
        );
      }
      const results = await Promise.all(ops);
      const failed = results.find(r => r.error);
      if (failed) {
        console.error('Error marking notifications read:', failed.error);
        return NextResponse.json({ error: 'Failed to mark notifications read' }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        message: `${personalIds.size + scheduleIds.size} notification(s) marked as read`,
      });
    }

    // "Smart" auto-acknowledge by event type (caller-scoped, personal table).
    // Used when an admin opens the page that resolves these notifications —
    // the bell clears even for items they never individually clicked.
    if (types && Array.isArray(types) && types.length > 0) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true, read: true, updated_at: now })
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
      { error: 'Provide notification_ids, schedule_ids, items, types, or mark_all: true' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Unexpected error in mark-read POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
