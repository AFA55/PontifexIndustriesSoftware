'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, Bell, BellOff, CheckCircle, AlertCircle, Clock,
  MessageSquare, Send, ChevronRight, CheckCheck, Loader2,
  CalendarDays, FileSignature, Receipt, Wrench, Truck,
  AlertTriangle, RefreshCw,
} from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  notification_type?: string | null;
  title: string;
  message: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

type FilterMode = 'all' | 'unread';

export default function NotificationsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('all');
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    setUser(currentUser);
  }, [router]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const res = await fetch('/api/notifications?limit=50', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data || []);
      } else {
        setLoadError(true);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setLoadError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) fetchNotifications();
  }, [user, fetchNotifications]);

  const markRead = async (ids: string[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ notification_ids: ids }),
      });
      setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, is_read: true } : n));
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ mark_all: true }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { /* silent */ }
    setMarkingAll(false);
  };

  const handleNotificationClick = (notif: Notification) => {
    if (!notif.is_read) markRead([notif.id]);
    if (notif.action_url) router.push(notif.action_url);
  };

  const getIcon = (notif: Notification) => {
    const key = notif.notification_type || notif.type;
    switch (key) {
      case 'clock_in_reminder': return <Clock className="w-5 h-5 text-orange-500" />;
      case 'timecard_approval': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'timecard_rejection': return <AlertCircle className="w-5 h-5 text-rose-500" />;
      case 'time_off_request':
      case 'operator_callout': return <CalendarDays className="w-5 h-5 text-violet-500" />;
      case 'job_dispatched': return <Truck className="w-5 h-5 text-sky-500" />;
      case 'signature_request': return <FileSignature className="w-5 h-5 text-indigo-500" />;
      case 'ready_to_invoice': return <Receipt className="w-5 h-5 text-emerald-500" />;
      case 'maintenance_request':
      case 'maintenance_update': return <Wrench className="w-5 h-5 text-amber-500" />;
      case 'reminder': return <Bell className="w-5 h-5 text-yellow-500" />;
      case 'system': return <Send className="w-5 h-5 text-blue-500" />;
      default: return <MessageSquare className="w-5 h-5 text-blue-500" />;
    }
  };

  const formatDate = (dateStr: string) => {
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
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const visible = filter === 'unread' ? notifications.filter(n => !n.is_read) : notifications;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      {/* Header */}
      <div className="bg-white/80 dark:bg-slate-900/80 border-b border-gray-200 dark:border-white/10 shadow-sm sticky top-0 z-40 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500 dark:text-white/70" />
              </Link>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Inbox
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">
                    {unreadCount}
                  </span>
                )}
              </h1>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingAll}
                className="flex items-center gap-2 px-3 py-2 min-h-[44px] bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 rounded-xl text-sm font-semibold transition-colors"
              >
                {markingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                Mark all read
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <div className="flex items-center gap-2 mt-3">
            {(['all', 'unread'] as FilterMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                className={`px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold capitalize transition-colors ${
                  filter === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/10'
                }`}
              >
                {mode}{mode === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {loadError && notifications.length === 0 ? (
          <div className="rounded-2xl p-8 text-center shadow-sm bg-white dark:bg-white/[0.04] border border-red-200 dark:border-red-500/30">
            <AlertTriangle className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Couldn&apos;t load your inbox</h3>
            <p className="text-gray-500 dark:text-white/50 mb-5 text-sm">
              Check your connection and try again.
            </p>
            <button
              onClick={fetchNotifications}
              className="inline-flex items-center gap-2 min-h-[44px] py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        ) : visible.length > 0 ? (
          <div className="space-y-2">
            {visible.map(notif => (
              <div
                key={notif.id}
                role="button"
                tabIndex={0}
                onClick={() => handleNotificationClick(notif)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleNotificationClick(notif); }}
                className={`rounded-2xl p-4 min-h-[44px] cursor-pointer transition-colors border ${
                  notif.is_read
                    ? 'bg-white dark:bg-white/[0.04] border-gray-100 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/[0.07]'
                    : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 hover:bg-blue-100/60 dark:hover:bg-blue-500/15'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/10 flex items-center justify-center flex-shrink-0 ${notif.is_read ? 'opacity-60' : ''}`}>
                    {getIcon(notif)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm ${notif.is_read ? 'font-semibold text-gray-600 dark:text-white/70' : 'font-bold text-gray-900 dark:text-white'}`}>
                        {notif.title}
                      </p>
                      {!notif.is_read && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />}
                    </div>
                    {notif.message && (
                      <p className={`text-sm mt-1 leading-relaxed line-clamp-3 ${notif.is_read ? 'text-gray-400 dark:text-white/40' : 'text-gray-600 dark:text-white/60'}`}>
                        {notif.message}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <p className="text-xs text-gray-400 dark:text-white/40">{formatDate(notif.created_at)}</p>
                      {notif.action_url && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-semibold">
                          Take action <ChevronRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <BellOff className="w-16 h-16 text-gray-300 dark:text-white/20 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-600 dark:text-white/70 mb-2">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
            </h3>
            <p className="text-gray-500 dark:text-white/40">
              You&apos;re all caught up! Notifications will appear here when you receive them.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
