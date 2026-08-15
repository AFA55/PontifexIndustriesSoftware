'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HardHat, ChevronRight } from 'lucide-react';
import { getCardPermission } from '@/lib/rbac';
import { supabase } from '@/lib/supabase';

/**
 * "Open Operator View" — the door from the management side to the crew side.
 *
 * WHY (founder, Aug 9): "David is supervisor but sometimes also has jobs of his
 * own that involve scanning... I'm operations manager but I do go do jobs
 * sometimes, and David and I should both have a card that says open operator
 * view so we can view and submit tickets and be able to go back to management
 * view with a button."
 *
 * One person, two hats. Not a role change and not a second login — the operator
 * ticket already branches on the crew SLOT rather than the role, so a supervisor
 * or ops manager dispatched into `assigned_to` runs the full operator flow. All
 * that was missing was a way in, and a way back (that half lives on
 * app/dashboard/my-jobs, which shows a "Back to management" button to these
 * same roles).
 *
 * Visibility is driven by the `operator_view` card permission in lib/rbac.ts, so
 * it follows the same role presets as every other card rather than a hardcoded
 * role list here.
 */
export default function OperatorViewCard({ role }: { role: string | undefined }) {
  // HOW MANY TICKETS ARE WAITING FOR THEM RIGHT NOW (founder, Aug 15: a button
  // "for him to switch to operator view WHEN HE GETS ASSIGNED TICKETS to
  // perform GPR"). The door already existed; what it never did was tell you
  // there was anything behind it, so a supervisor with a job waiting had to
  // guess and go look. Same endpoint the crew's own My Jobs screen uses, so the
  // count and the list can never disagree.
  const [ticketCount, setTicketCount] = useState<number | null>(null);
  const visible = !!role && getCardPermission(null, 'operator_view', role) !== 'none';

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(
          '/api/job-orders?include_helper_jobs=true&includeCompleted=false&as=operator',
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const jobs: unknown[] = json?.data ?? json?.jobs ?? [];
        if (!cancelled && Array.isArray(jobs)) setTicketCount(jobs.length);
      } catch {
        // A count is a nicety — the door still opens without it.
      }
    })();
    return () => { cancelled = true; };
  }, [visible]);

  // null user-permissions → falls through to the role preset, which is what we
  // want: this card follows lib/rbac.ts rather than a hardcoded role list.
  if (!visible) return null;

  const hasTickets = (ticketCount ?? 0) > 0;

  return (
    <Link
      href="/dashboard/my-jobs"
      className="group flex items-center gap-4 rounded-xl border border-sky-200 dark:border-sky-800/50 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 p-4 shadow-sm transition-all hover:shadow-md"
    >
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-sky-500 shadow-sm">
        <HardHat className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Open Operator View</p>
          {hasTickets && (
            <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {ticketCount} ticket{ticketCount === 1 ? '' : 's'} waiting
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-600 dark:text-white/60">
          {hasTickets
            ? `You've been dispatched ${ticketCount === 1 ? 'a job' : 'jobs'} of your own — open ${ticketCount === 1 ? 'it' : 'them'} here and submit like the crew. Switch back anytime.`
            : 'Run your own jobs — view and submit tickets like the crew. You can switch back anytime.'}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-sky-400 transition-colors group-hover:text-sky-600" />
    </Link>
  );
}
