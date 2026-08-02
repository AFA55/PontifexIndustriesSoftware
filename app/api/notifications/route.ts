export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications — UNIFIED personal feed.
 *
 * Merges BOTH notification tables into one normalized, newest-first feed:
 *   - `notifications`          (user_id = caller)
 *   - `schedule_notifications` (recipient_id = caller — auto clock-outs,
 *     late arrivals, job assignments... previously rendered by NO surface)
 *
 * Query params:
 *   ?limit=        default 20, max 50
 *   ?before=<ISO>  cursor — only rows strictly older than this timestamp
 *   ?unread_only=true
 *
 * Response: { success, data: { notifications: FeedItem[], unread_count,
 *             has_more, next_cursor } } — plus a top-level `unread_count`
 * mirror for legacy consumers that read the old flat shape.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import {
  clampLimit,
  mergeFeed,
  normalizePersonalRow,
  normalizeScheduleRow,
} from '@/lib/notifications-feed';

/**
 * Defense-in-depth tenant scoping. Rows are already caller-scoped by
 * user_id/recipient_id; this additionally excludes rows stamped with a
 * DIFFERENT tenant. Null-tenant rows are kept (sendNotification and
 * super_admin platform rows can legitimately have tenant_id null), and
 * super_admin callers (tenantId null) skip the filter entirely.
 */
function tenantScope<T extends { or: (f: string) => T }>(query: T, tenantId: string | null): T {
  if (!tenantId) return query;
  return query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const limit = clampLimit(searchParams.get('limit'));
    const before = searchParams.get('before');
    if (before && !Number.isFinite(Date.parse(before))) {
      return NextResponse.json({ error: 'Invalid before cursor' }, { status: 400 });
    }

    // Fetch limit+1 per source so has_more is exact without count queries.
    let personalQ = tenantScope(
      supabaseAdmin
        .from('notifications')
        .select('*')
        .eq('user_id', auth.userId),
      auth.tenantId
    )
      .order('created_at', { ascending: false })
      .limit(limit + 1);
    if (unreadOnly) personalQ = personalQ.eq('is_read', false);
    if (before) personalQ = personalQ.lt('created_at', before);

    let scheduleQ = tenantScope(
      supabaseAdmin
        .from('schedule_notifications')
        .select('*')
        .eq('recipient_id', auth.userId),
      auth.tenantId
    )
      .order('created_at', { ascending: false })
      .limit(limit + 1);
    if (unreadOnly) scheduleQ = scheduleQ.eq('read', false);
    if (before) scheduleQ = scheduleQ.lt('created_at', before);

    const [personalRes, scheduleRes, personalCountRes, scheduleCountRes] = await Promise.all([
      personalQ,
      scheduleQ,
      tenantScope(
        supabaseAdmin
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', auth.userId),
        auth.tenantId
      ).eq('is_read', false),
      tenantScope(
        supabaseAdmin
          .from('schedule_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_id', auth.userId),
        auth.tenantId
      ).eq('read', false),
    ]);

    if (personalRes.error) {
      console.error('Error fetching notifications:', personalRes.error);
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }
    // Schedule feed degrades gracefully — the personal feed still renders.
    if (scheduleRes.error) {
      console.error('Error fetching schedule_notifications:', scheduleRes.error);
    }

    const { items, has_more, next_cursor } = mergeFeed(
      [
        (personalRes.data || []).map(normalizePersonalRow),
        (scheduleRes.error ? [] : scheduleRes.data || []).map(normalizeScheduleRow),
      ],
      limit
    );

    const unreadCount = (personalCountRes.count || 0) + (scheduleCountRes.count || 0);

    return NextResponse.json({
      success: true,
      data: {
        notifications: items,
        unread_count: unreadCount,
        has_more,
        next_cursor,
      },
      // Legacy mirror — old consumers read a top-level unread_count.
      unread_count: unreadCount,
    });
  } catch (error) {
    console.error('Unexpected error in notifications GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/notifications — delete the caller's OWN notifications.
 * Body: { ids: string[] }            — personal (`notifications`) rows
 *       { schedule_ids: string[] }   — `schedule_notifications` rows
 *       { clear_read: true }         — sweep everything already read (both tables)
 * Scoped to auth.userId — you can never delete another user's notifications.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    let body: any = {};
    try { body = await request.json(); } catch { /* empty body ok for clear_read via ids check */ }

    if (body?.clear_read === true) {
      const [personal, schedule] = await Promise.all([
        supabaseAdmin
          .from('notifications')
          .delete()
          .eq('user_id', auth.userId)
          .eq('is_read', true),
        supabaseAdmin
          .from('schedule_notifications')
          .delete()
          .eq('recipient_id', auth.userId)
          .eq('read', true),
      ]);
      if (personal.error || schedule.error) {
        return NextResponse.json({ error: 'Failed to clear notifications' }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    const takeIds = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x: unknown) => typeof x === 'string').slice(0, 100) : [];
    const ids = takeIds(body?.ids);
    const scheduleIds = takeIds(body?.schedule_ids);

    if (ids.length === 0 && scheduleIds.length === 0) {
      return NextResponse.json(
        { error: 'Provide ids[], schedule_ids[], or clear_read: true' },
        { status: 400 }
      );
    }

    if (ids.length > 0) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .delete()
        .in('id', ids)
        .eq('user_id', auth.userId);
      if (error) return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 });
    }
    if (scheduleIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('schedule_notifications')
        .delete()
        .in('id', scheduleIds)
        .eq('recipient_id', auth.userId);
      if (error) return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
