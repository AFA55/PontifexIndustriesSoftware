'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, X, AlertCircle, CheckCircle, Clock, MessageSquare, Send, ChevronRight, BellOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

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

interface NotificationBellProps {
  className?: string;
  /** 'dark' for dark header backgrounds (operator), 'light' for light backgrounds */
  variant?: 'dark' | 'light';
}

export default function NotificationBell({ className = '', variant = 'dark' }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/notifications?limit=15', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data || []);
        setUnreadCount(json.unread_count || 0);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (ids: string[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ notification_ids: ids }),
      });

      setNotifications(prev =>
        prev.map(n => ids.includes(n.id) ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - ids.length));
    } catch {
      // silently fail
    }
  };

  const markAllRead = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ mark_all: true }),
      });

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // silently fail
    }
    setLoading(false);
  };

  const handleNotificationClick = (notif: Notification) => {
    if (!notif.is_read) {
      markRead([notif.id]);
    }
    if (notif.action_url) {
      setOpen(false);
      router.push(notif.action_url);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'clock_in_reminder':
        return <Clock className="w-4 h-4 text-orange-400" />;
      case 'timecard_approval':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'timecard_rejection':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'reminder':
        return <Bell className="w-4 h-4 text-yellow-400" />;
      case 'system':
        return <Send className="w-4 h-4 text-blue-400" />;
      default:
        return <MessageSquare className="w-4 h-4 text-purple-400" />;
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const isDark = variant === 'dark';

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`relative p-2.5 rounded-xl transition-all duration-200 ${
          isDark
            ? unreadCount > 0
              ? 'bg-white/20 hover:bg-white/30 text-white'
              : 'bg-white/10 hover:bg-white/20 text-white/70'
            : unreadCount > 0
              ? 'bg-purple-100 hover:bg-purple-200 text-purple-700'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
        }`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse shadow-lg">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-slate-900 rounded-2xl border border-white/10 shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-slate-800/50">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-purple-400" />
              Notifications
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-purple-600 text-white text-[10px] font-bold rounded-full">
                  {unreadCount}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={loading}
                  className="text-xs text-purple-400 hover:text-purple-300 font-semibold transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <BellOff className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No notifications yet</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  className={`px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer flex items-start gap-3 ${
                    !notif.is_read ? 'bg-purple-500/5' : ''
                  }`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    {getIcon(notif.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold truncate ${
                        !notif.is_read ? 'text-white' : 'text-gray-300'
                      }`}>
                        {notif.title}
                      </p>
                      {!notif.is_read && (
                        <span className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0" />
                      )}
                    </div>
                    {notif.message && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{notif.message}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[10px] text-gray-500">{timeAgo(notif.created_at)}</p>
                      {notif.action_url && (
                        <span className="text-[10px] text-purple-400 font-semibold">View</span>
                      )}
                    </div>
                  </div>
                  {notif.action_url && (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-2" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-white/10 bg-slate-800/50">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push('/dashboard/notifications');
                }}
                className="w-full text-center text-xs text-purple-400 hover:text-purple-300 font-semibold transition-colors"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
