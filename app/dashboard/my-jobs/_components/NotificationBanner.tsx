'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, X } from 'lucide-react';

interface DispatchNotification {
  id: string;
  message: string;
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

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch unread dispatched notifications
      const { data, error } = await supabase
        .from('schedule_notifications')
        .select('id, message, created_at')
        .eq('operator_id', user.id)
        .eq('type', 'dispatched')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data && data.length > 0) {
        setNotifications(data);
      }
    } catch (err) {
      // Silently fail — notifications are non-critical
    }
  };

  const handleDismiss = async () => {
    setDismissed(true);

    // Mark notifications as read
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const ids = notifications.map(n => n.id);
      await supabase
        .from('schedule_notifications')
        .update({ is_read: true })
        .in('id', ids);
    } catch (err) {
      console.error('Error marking notifications as read:', err);
    }
  };

  if (dismissed || notifications.length === 0) return null;

  // Parse the most recent notification message for the date
  const latestMessage = notifications[0]?.message || 'Your schedule has been published';

  return (
    <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white rounded-2xl shadow-xl p-4 mb-4 animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">Schedule Published</p>
          <p className="text-sm text-blue-100 mt-0.5">{latestMessage}</p>
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
