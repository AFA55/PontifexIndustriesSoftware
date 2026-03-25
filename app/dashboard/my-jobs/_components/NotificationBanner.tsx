'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, Briefcase, X } from 'lucide-react';

interface DispatchNotification {
  id: string;
  title: string;
  message: string | null;
  type: string;
  created_at: string;
}

export default function NotificationBanner() {
  const [notifications, setNotifications] = useState<DispatchNotification[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch unread job-related notifications for the current user
      const { data, error } = await supabase
        .from('schedule_notifications')
        .select('id, title, message, type, created_at')
        .eq('recipient_id', session.user.id)
        .in('type', ['dispatched', 'job_assigned', 'assigned'])
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data && data.length > 0) {
        setNotifications(data);
      }
    } catch {
      // Silently fail — notifications are non-critical
    }
  };

  const handleDismiss = async () => {
    setDismissed(true);

    // Mark notifications as read
    try {
      const ids = notifications.map(n => n.id);
      await supabase
        .from('schedule_notifications')
        .update({ read: true })
        .in('id', ids);
    } catch {
      // Non-critical
    }
  };

  if (dismissed || notifications.length === 0) return null;

  const latest = notifications[0];
  const isAssignment = latest.type === 'job_assigned' || latest.type === 'assigned';
  const Icon = isAssignment ? Briefcase : Bell;
  const gradientClass = isAssignment
    ? 'bg-gradient-to-r from-orange-500 via-orange-600 to-red-600'
    : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600';

  return (
    <div className={`${gradientClass} text-white rounded-2xl shadow-xl p-4 mb-4 animate-in slide-in-from-top-2 duration-300`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">{latest.title}</p>
          {latest.message && (
            <p className="text-sm text-white/80 mt-0.5 leading-snug">{latest.message}</p>
          )}
          {notifications.length > 1 && (
            <p className="text-xs text-white/60 mt-1">+{notifications.length - 1} more notification{notifications.length > 2 ? 's' : ''}</p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="p-1.5 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
