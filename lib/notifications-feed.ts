/**
 * Unified notification feed — pure normalize / merge / cursor helpers.
 *
 * Two live tables feed the bell + inbox:
 *   - `notifications`          — personal rows (user_id). Has BOTH `is_read`
 *     and a legacy `read` column (writers set both; very old rows may only
 *     have `read`). Has `action_url`.
 *   - `schedule_notifications` — job-flow rows (recipient_id). Only `read`
 *     (+ `read_at`), NO action_url — we derive a sensible default per type.
 *
 * The API route queries both and uses these helpers to normalize + merge-sort
 * into one feed. Kept pure (no supabase imports) so they're unit-testable.
 */

export type FeedSource = 'notifications' | 'schedule';

export interface FeedItem {
  id: string;
  source: FeedSource;
  /** Semantic type (personal rows: notification_type wins over the visual-tone `type`). */
  type: string;
  title: string;
  message: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
}

/** Row shape (subset) from the `notifications` table. */
export interface PersonalNotificationRow {
  id: string;
  type?: string | null;
  notification_type?: string | null;
  title?: string | null;
  message?: string | null;
  action_url?: string | null;
  is_read?: boolean | null;
  /** Legacy flag — very old rows may have ONLY this set. */
  read?: boolean | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
}

/** Row shape (subset) from the `schedule_notifications` table. */
export interface ScheduleNotificationRow {
  id: string;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  read?: boolean | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  job_order_id?: string | null;
}

/**
 * schedule_notifications has no action_url column — derive a sensible default
 * destination from the row type so "Open" buttons still work.
 */
export function deriveScheduleActionUrl(type: string | null | undefined): string | null {
  switch (type) {
    case 'auto_clock_out':
    case 'late_arrival':
      return '/dashboard/timecard';
    case 'auto_clock_out_admin':
      return '/dashboard/admin/timecards';
    case 'job_assigned':
    case 'assigned':
    case 'dispatched':
      return '/dashboard/my-jobs';
    default:
      return null;
  }
}

export function normalizePersonalRow(row: PersonalNotificationRow): FeedItem {
  return {
    id: row.id,
    source: 'notifications',
    // notification_type is the semantic key (icon/copy); `type` is often just
    // the visual tone ('info'). Prefer semantic when present.
    type: row.notification_type || row.type || 'info',
    title: row.title || 'Notification',
    message: row.message ?? null,
    action_url: row.action_url ?? null,
    // Either flag counts as read — legacy rows only wrote `read`.
    is_read: row.is_read === true || row.read === true,
    created_at: row.created_at,
    metadata: row.metadata ?? null,
    related_entity_type: row.related_entity_type ?? null,
    related_entity_id: row.related_entity_id ?? null,
  };
}

export function normalizeScheduleRow(row: ScheduleNotificationRow): FeedItem {
  return {
    id: row.id,
    source: 'schedule',
    type: row.type || 'info',
    title: row.title || 'Notification',
    message: row.message ?? null,
    action_url: deriveScheduleActionUrl(row.type),
    is_read: row.read === true,
    created_at: row.created_at,
    metadata: row.metadata ?? null,
    related_entity_type: row.job_order_id ? 'job_order' : null,
    related_entity_id: row.job_order_id ?? null,
  };
}

/**
 * Merge-sort N already-normalized lists desc by created_at (ties broken by id
 * for a stable order). Each list should be fetched with `limit + 1` rows so
 * has_more is accurate without a count query.
 */
export function mergeFeed(
  lists: FeedItem[][],
  limit: number
): { items: FeedItem[]; has_more: boolean; next_cursor: string | null } {
  const merged = lists
    .flat()
    .sort((a, b) => {
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
  const items = merged.slice(0, limit);
  const has_more = merged.length > limit;
  return {
    items,
    has_more,
    next_cursor: has_more && items.length > 0 ? items[items.length - 1].created_at : null,
  };
}

/** Clamp a ?limit= query value: default 20, max 50, min 1. */
export function clampLimit(raw: string | null | undefined, def = 20, max = 50): number {
  const n = parseInt(raw || '', 10);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(n, max);
}

/** Parse a `?focus=<source>:<id>` param. Bare ids default to 'notifications'. */
export function parseFocusParam(
  raw: string | null | undefined
): { source: FeedSource; id: string } | null {
  if (!raw) return null;
  const idx = raw.indexOf(':');
  if (idx === -1) return raw ? { source: 'notifications', id: raw } : null;
  const source = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  if (!id) return null;
  if (source !== 'notifications' && source !== 'schedule') return null;
  return { source, id };
}

/** Stable per-item key (ids could theoretically collide across tables). */
export function feedItemKey(item: Pick<FeedItem, 'source' | 'id'>): string {
  return `${item.source}:${item.id}`;
}
