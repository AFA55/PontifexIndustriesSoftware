'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, Bell, BellOff, CheckCircle, AlertCircle, Clock,
  MessageSquare, Send, ChevronRight, CheckCheck, Loader2
} from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  action_url: string | null;
  bypass_nfc: boolean;
  is_read: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export default function NotificationsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    setUser(currentUser);
  }, [router]);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/notifications?limit=50', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
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

  const getIcon = (type: string) => {
    switch (type) {
      case 'clock_in_reminder': return <Clock className="w-5 h-5 text-orange-400" />;
      case 'timecard_approval': return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'timecard_rejection': return <AlertCircle className="w-5 h-5 text-red-400" />;
      case 'reminder': return <Bell className="w-5 h-5 text-yellow-400" />;
      case 'system': return <Send className="w-5 h-5 text-blue-400" />;
      default: return <MessageSquare className="w-5 h-5 text-blue-600" />;
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} minutes ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hours ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const unreadNotifications = notifications.filter(n => !n.is_read);
  const readNotifications = notifications.filter(n => n.is_read);
  const unreadCount = unreadNotifications.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 border-b border-gray-200 shadow-sm sticky top-0 z-40 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </Link>
              <div>
                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-blue-600" />
                  Notifications
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </h1>
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingAll}
                className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-sm font-semibold transition-colors"
              >
                {markingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                Mark all read
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {/* Unread Section */}
        {unreadNotifications.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-3 px-1">
              Unread ({unreadCount})
            </h2>
            <div className="space-y-2">
              {unreadNotifications.map(notif => (
                <div
                  key={notif.id}
                  className="bg-blue-50 border border-blue-200 rounded-2xl p-4 hover:bg-blue-100/50 transition-colors cursor-pointer"
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      {getIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900">{notif.title}</p>
                        <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                      </div>
                      {notif.message && (
                        <p className="text-sm text-gray-600 mt-1 leading-relaxed">{notif.message}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <p className="text-xs text-gray-400">{formatDate(notif.created_at)}</p>
                        {notif.action_url && (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold">
                            Take action <ChevronRight className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Read Section */}
        {readNotifications.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
              Earlier
            </h2>
            <div className="space-y-2">
              {readNotifications.map(notif => (
                <div
                  key={notif.id}
                  className="bg-white border border-gray-100 rounded-2xl p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 opacity-60">
                      {getIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-600">{notif.title}</p>
                      {notif.message && (
                        <p className="text-sm text-gray-400 mt-1 line-clamp-2">{notif.message}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">{formatDate(notif.created_at)}</p>
                    </div>
                    {notif.action_url && (
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {notifications.length === 0 && (
          <div className="text-center py-20">
            <BellOff className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-600 mb-2">No notifications</h3>
            <p className="text-gray-500">You're all caught up! Notifications will appear here when you receive them.</p>
          </div>
        )}
      </div>
    </div>
  );
}
