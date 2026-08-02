'use client';

import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useVisiblePoll } from '@/lib/hooks/useVisiblePoll';

/**
 * Lightweight unread-notification counter (unified feed: both tables).
 *
 * Fetches `/api/notifications?limit=1` — the response's unread_count is what
 * we want; limit=1 keeps the payload tiny. Polls visibility-aware at a SLOWER
 * cadence than the bell (which has its own 2-min poll) so surfaces that show
 * a badge don't double the function bill.
 */
export function useUnreadNotifications(intervalMs = 300_000): number {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/notifications?limit=1', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setCount(json.data?.unread_count ?? json.unread_count ?? 0);
      }
    } catch {
      // badge is non-critical
    }
  }, []);

  useVisiblePoll(fetchCount, { intervalMs, runOnMount: true });

  return count;
}
