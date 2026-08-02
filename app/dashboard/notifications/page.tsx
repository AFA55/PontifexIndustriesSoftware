'use client';

export const dynamic = 'force-dynamic';

/**
 * Inbox — the operator-facing notifications page.
 *
 * Unified feed (both `notifications` + `schedule_notifications` via the
 * merged API). Cards expand IN PLACE to the FULL message — tapping a row
 * never navigates; navigation only happens on the explicit action button
 * inside the expanded card. Supports ?focus=<source>:<id> (bell rows link
 * here) to auto-scroll + expand a specific item.
 */

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  parseFocusParam,
  feedItemKey,
  type FeedItem,
} from '@/lib/notifications-feed';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import {
  ArrowLeft, Bell, BellOff, CheckCircle, AlertCircle, Clock,
  MessageSquare, Send, ChevronDown, ChevronRight, CheckCheck,
  CalendarDays, FileSignature, Receipt, Wrench, Truck,
  AlertTriangle, RefreshCw, Trash2, MessageSquarePlus,
} from 'lucide-react';
import Link from 'next/link';

type FilterMode = 'all' | 'unread';

const PAGE_SIZE = 20;

function getIcon(type: string) {
  switch (type) {
    case 'clock_in_reminder': return <Clock className="w-5 h-5 text-orange-500" />;
    case 'timecard_approval': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
    case 'timecard_rejection': return <AlertCircle className="w-5 h-5 text-rose-500" />;
    case 'auto_clock_out':
    case 'auto_clock_out_admin': return <Clock className="w-5 h-5 text-rose-500" />;
    case 'late_arrival': return <AlertCircle className="w-5 h-5 text-amber-500" />;
    case 'time_off_request':
    case 'operator_callout': return <CalendarDays className="w-5 h-5 text-violet-500" />;
    case 'job_dispatched':
    case 'dispatched':
    case 'job_assigned':
    case 'assigned': return <Truck className="w-5 h-5 text-sky-500" />;
    case 'signature_request': return <FileSignature className="w-5 h-5 text-indigo-500" />;
    case 'ready_to_invoice': return <Receipt className="w-5 h-5 text-emerald-500" />;
    case 'maintenance_request':
    case 'maintenance_update': return <Wrench className="w-5 h-5 text-amber-500" />;
    case 'reminder': return <Bell className="w-5 h-5 text-yellow-500" />;
    case 'system': return <Send className="w-5 h-5 text-blue-500" />;
    default: return <MessageSquare className="w-5 h-5 text-brand" />;
  }
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fullTimestamp(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/** Contextual label for the explicit navigation button inside an expanded card. */
function actionLabel(url: string): string {
  if (url.startsWith('/dashboard/admin/timecards')) return 'Review Timecards';
  if (url.startsWith('/dashboard/timecard')) return 'Go to Timecard';
  if (url.startsWith('/dashboard/my-jobs')) return 'Go to My Jobs';
  if (url.startsWith('/dashboard/admin/settings/feedback')) return 'Open Feedback';
  return 'Open';
}

function NotificationsInbox() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [authed, setAuthed] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const focusConsumedRef = useRef(false);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    setAuthed(true);
  }, [router]);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const fetchPage = useCallback(async (mode: FilterMode, cursor: string | null) => {
    const token = await getToken();
    if (!token) return null;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (mode === 'unread') params.set('unread_only', 'true');
    if (cursor) params.set('before', cursor);
    const res = await fetch(`/api/notifications?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data as {
      notifications: FeedItem[];
      unread_count: number;
      has_more: boolean;
      next_cursor: string | null;
    };
  }, [getToken]);

  const loadInitial = useCallback(async (mode: FilterMode) => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await fetchPage(mode, null);
      if (!data) { setLoadError(true); return; }
      setItems(data.notifications);
      setUnreadCount(data.unread_count);
      setHasMore(data.has_more);
      setNextCursor(data.next_cursor);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    if (authed) loadInitial(filter);
  }, [authed, filter, loadInitial]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(filter, nextCursor);
      if (data) {
        setItems(prev => {
          const seen = new Set(prev.map(feedItemKey));
          return [...prev, ...data.notifications.filter(n => !seen.has(feedItemKey(n)))];
        });
        setHasMore(data.has_more);
        setNextCursor(data.next_cursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, filter, nextCursor, loadingMore]);

  const markRead = useCallback(async (target: FeedItem) => {
    if (target.is_read) return;
    // Optimistic — the write is fire-and-forget.
    setItems(prev => prev.map(n => feedItemKey(n) === feedItemKey(target) ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      const token = await getToken();
      if (!token) return;
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          target.source === 'schedule'
            ? { schedule_ids: [target.id] }
            : { notification_ids: [target.id] }
        ),
      });
    } catch { /* silent */ }
  }, [getToken]);

  const toggleExpand = useCallback((item: FeedItem) => {
    const key = feedItemKey(item);
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!item.is_read) markRead(item);
  }, [markRead]);

  // ?focus=<source>:<id> — expand + scroll to that item after the first load.
  useEffect(() => {
    if (loading || focusConsumedRef.current) return;
    const focus = parseFocusParam(searchParams.get('focus'));
    if (!focus) { focusConsumedRef.current = true; return; }
    const key = `${focus.source}:${focus.id}`;
    const target = items.find(n => feedItemKey(n) === key);
    focusConsumedRef.current = true;
    if (!target) return; // older than the first page — user can Load more
    setExpanded(prev => new Set(prev).add(key));
    if (!target.is_read) markRead(target);
    // Wait a frame so the expanded card has laid out before scrolling.
    requestAnimationFrame(() => {
      itemRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [loading, items, searchParams, markRead]);

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      const token = await getToken();
      if (!token) return;
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mark_all: true }),
      });
      setItems(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* silent */ } finally {
      setMarkingAll(false);
    }
  };

  const deleteOne = async (target: FeedItem) => {
    setItems(prev => prev.filter(n => feedItemKey(n) !== feedItemKey(target)));
    try {
      const token = await getToken();
      if (!token) return;
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          target.source === 'schedule' ? { schedule_ids: [target.id] } : { ids: [target.id] }
        ),
      });
    } catch { /* fail-soft */ }
  };

  const clearRead = async () => {
    setItems(prev => prev.filter(n => !n.is_read));
    try {
      const token = await getToken();
      if (!token) return;
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clear_read: true }),
      });
    } catch { /* fail-soft */ }
  };

  const readCount = items.filter(n => n.is_read).length;
  const visible = filter === 'unread' ? items.filter(n => !n.is_read || expanded.has(feedItemKey(n))) : items;

  if (loading && items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
        <Spinner size="lg" brand />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Sticky header — compact, backdrop-blur (operators on phones) */}
      <div className="bg-white/85 dark:bg-slate-900/85 border-b border-gray-200 dark:border-white/10 shadow-sm sticky top-0 z-40 backdrop-blur-xl pt-safe">
        <div className="container mx-auto px-4 py-3 max-w-2xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href="/dashboard"
                aria-label="Back to dashboard"
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500 dark:text-white/70" />
              </Link>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 min-w-0">
                <Bell className="w-5 h-5 text-brand flex-shrink-0" />
                <span className="truncate">Inbox</span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-brand text-white text-xs font-bold rounded-full flex-shrink-0">
                    {unreadCount}
                  </span>
                )}
              </h1>
            </div>
            {/* Message Management — the "tell the office anything" channel */}
            <Button
              href="/dashboard/feedback/new?type=message"
              size="md"
              variant="primary"
              leftIcon={<MessageSquarePlus className="w-4 h-4" />}
              className="flex-shrink-0"
            >
              <span className="hidden sm:inline">Message Management</span>
              <span className="sm:hidden">Message</span>
            </Button>
          </div>

          {/* Filter pills + bulk actions */}
          <div className="flex items-center justify-between gap-2 mt-2.5">
            <div className="flex items-center gap-2">
              {(['all', 'unread'] as FilterMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => { setExpanded(new Set()); setFilter(mode); }}
                  className={`px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold capitalize transition-colors ${
                    filter === mode
                      ? 'bg-brand text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/10'
                  }`}
                >
                  {mode}{mode === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {readCount > 0 && (
                <Button variant="ghost" size="md" onClick={clearRead} leftIcon={<Trash2 className="w-4 h-4" />} aria-label="Clear read notifications">
                  <span className="hidden sm:inline">Clear read</span>
                </Button>
              )}
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="md"
                  onClick={markAllRead}
                  loading={markingAll}
                  leftIcon={<CheckCheck className="w-4 h-4" />}
                  aria-label="Mark all notifications read"
                >
                  <span className="hidden sm:inline">Mark all read</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 max-w-2xl pb-12">
        {loadError && items.length === 0 ? (
          <Card>
            <EmptyState
              icon={AlertTriangle}
              title="Couldn't load your inbox"
              description="Check your connection and try again."
              action={
                <Button onClick={() => loadInitial(filter)} leftIcon={<RefreshCw className="w-4 h-4" />}>
                  Try again
                </Button>
              }
            />
          </Card>
        ) : visible.length > 0 ? (
          <div className="space-y-2.5">
            {visible.map(notif => {
              const key = feedItemKey(notif);
              const isExpanded = expanded.has(key);
              return (
                <Card
                  key={key}
                  ref={(el: HTMLDivElement | null) => { itemRefs.current[key] = el; }}
                  noPadding
                  className={`overflow-hidden transition-colors ${
                    notif.is_read
                      ? ''
                      : 'border-brand/40 dark:border-brand/40 bg-brand/[0.04] dark:bg-brand/10'
                  }`}
                >
                  {/* Row header — tap to expand/collapse IN PLACE (never navigates) */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpand(notif)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(notif); } }}
                    className="w-full p-4 min-h-[44px] cursor-pointer flex items-start gap-3 text-left hover:bg-gray-50/70 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <div className={`w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/10 flex items-center justify-center flex-shrink-0 ${notif.is_read ? 'opacity-60' : ''}`}>
                      {getIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm ${notif.is_read ? 'font-semibold text-gray-600 dark:text-white/70' : 'font-bold text-gray-900 dark:text-white'}`}>
                          {notif.title}
                        </p>
                        {!notif.is_read && <span className="w-2 h-2 bg-brand rounded-full flex-shrink-0" aria-label="Unread" />}
                      </div>
                      {notif.message && (
                        <p
                          className={`text-sm mt-1 leading-relaxed ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'} ${
                            notif.is_read && !isExpanded
                              ? 'text-gray-400 dark:text-white/40'
                              : 'text-gray-700 dark:text-white/75'
                          }`}
                        >
                          {notif.message}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-white/40 mt-2">
                        {isExpanded ? fullTimestamp(notif.created_at) : timeAgo(notif.created_at)}
                      </p>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 dark:text-white/40 flex-shrink-0 mt-2 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>

                  {/* Expanded footer — explicit actions only */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-white/5">
                      {notif.action_url && (
                        <Button
                          variant="secondary"
                          size="md"
                          className="mt-3"
                          rightIcon={<ChevronRight className="w-4 h-4" />}
                          onClick={() => router.push(notif.action_url!)}
                        >
                          {actionLabel(notif.action_url)}
                        </Button>
                      )}
                      {notif.is_read && (
                        <Button
                          variant="ghost"
                          size="md"
                          className="mt-3 text-gray-500 hover:text-rose-600 dark:text-white/50 dark:hover:text-rose-400"
                          leftIcon={<Trash2 className="w-4 h-4" />}
                          onClick={() => deleteOne(notif)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}

            {hasMore && (
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={loadMore}
                loading={loadingMore}
                className="mt-1"
              >
                Load more
              </Button>
            )}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={BellOff}
              title={filter === 'unread' ? 'No unread notifications' : 'No notifications'}
              description="You're all caught up! Notifications will appear here when you receive them."
              action={
                <Button
                  href="/dashboard/feedback/new?type=message"
                  variant="secondary"
                  leftIcon={<MessageSquarePlus className="w-4 h-4" />}
                >
                  Message Management
                </Button>
              }
            />
          </Card>
        )}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
          <Spinner size="lg" brand />
        </div>
      }
    >
      <NotificationsInbox />
    </Suspense>
  );
}
