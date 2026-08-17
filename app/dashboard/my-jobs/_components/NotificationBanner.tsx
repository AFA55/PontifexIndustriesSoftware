'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, Briefcase, X } from 'lucide-react';
import { dispatchBannerStatus, type DispatchBannerStatus } from '@/lib/schedule-banners';

interface DispatchNotification {
  id: string;
  title: string;
  message: string | null;
  type: string;
  created_at: string;
}

interface NotificationBannerProps {
  /**
   * Reports whether this banner owns the top of the screen, so the page can
   * hold Continuing Projects back until it does not (founder: "have one or the
   * other"). See lib/schedule-banners.ts for the rule and why the status is
   * three-state rather than a boolean.
   */
  onStatusChange?: (status: DispatchBannerStatus) => void;
}

/** Watchdog: past this, an unanswered lookup counts as "nothing to announce". */
const LOOKUP_TIMEOUT_MS = 2500;

export default function NotificationBanner({ onStatusChange }: NotificationBannerProps) {
  const [notifications, setNotifications] = useState<DispatchNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchNotifications = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Unread job-related notifications for the current user. `read = false`
        // IS the dismissal state — see handleDismiss below.
        const { data, error } = await supabase
          .from('schedule_notifications')
          .select('id, title, message, type, created_at')
          .eq('recipient_id', session.user.id)
          .in('type', ['dispatched', 'job_assigned', 'assigned'])
          .eq('read', false)
          .order('created_at', { ascending: false })
          .limit(5);

        if (!cancelled && !error && data && data.length > 0) {
          setNotifications(data);
        }
      } catch {
        // Silently fail — notifications are non-critical.
      } finally {
        // ALWAYS settle. A lookup stuck in `checking` would hold Continuing
        // Projects off the screen forever, which is worse than the crowding
        // this whole change is fixing. The `finally` covers the throw and the
        // no-session early return; the timer below covers a hang.
        if (!cancelled) setLoaded(true);
      }
    };

    fetchNotifications();
    const watchdog = setTimeout(() => {
      if (!cancelled) setLoaded(true);
    }, LOOKUP_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
    };
  }, []);

  const status = dispatchBannerStatus({
    loaded,
    unreadCount: notifications.length,
    dismissedThisSession: dismissed,
  });

  // Tell the page which surface owns the slot. Ref-guarded so an unchanged
  // status never re-renders the parent mid-scroll.
  const lastReported = useRef<DispatchBannerStatus | null>(null);
  useEffect(() => {
    if (lastReported.current === status) return;
    lastReported.current = status;
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  const handleDismiss = async () => {
    // Optimistic — the banner goes and Continuing Projects arrives in the same
    // frame; the write below is what makes it stick across reloads.
    setDismissed(true);

    // Mark as read through the bearer-auth API. The old public-client
    // .update() was a SILENT NO-OP (no UPDATE policy on the table), so the
    // same banner re-appeared on every visit.
    //
    // This write IS the persistence for the dismissal, and it is scoped to
    // these notification ids — a NEW dispatch inserts a NEW row with
    // read = false, so tomorrow's ticket still announces itself.
    try {
      const ids = notifications.map(n => n.id);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ schedule_ids: ids }),
      });
    } catch {
      // Non-critical
    }
  };

  if (status !== 'unread') return null;

  const latest = notifications[0];
  const isAssignment = latest.type === 'job_assigned' || latest.type === 'assigned';
  const Icon = isAssignment ? Briefcase : Bell;
  const gradientClass = isAssignment
    ? 'bg-gradient-to-r from-orange-500 via-orange-600 to-red-600'
    : 'bg-gradient-to-r from-brand via-brand-accent to-brand';

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
            <p className="text-xs text-white/70 mt-1">+{notifications.length - 1} more notification{notifications.length > 2 ? 's' : ''}</p>
          )}
        </div>
        {/* THE X IS THE CONTROL THAT REVEALS CONTINUING PROJECTS, so it has to
            be hittable with a work glove on the first try. 44x44 minimum, with
            the negative margins pulling the padding back out of the layout so
            the bigger target costs no card height. */}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss notification"
          className="-my-1 -mr-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/25 active:bg-white/30"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
