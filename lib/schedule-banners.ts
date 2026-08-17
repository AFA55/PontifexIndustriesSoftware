/**
 * WHICH BANNER OWNS THE TOP OF "MY SCHEDULE".
 *
 * THE COMPLAINT (founder, Aug 16): "Make continuing projects easier to see in
 * dark mode, and remove that notification in bright red — have one or the
 * other. After they click X on the notification then show continuing projects.
 * Both showing up at once takes up a lot of space."
 *
 * On a 375px phone the red dispatch banner (~92px) plus the Continuing
 * Projects card (~60px per row + a 44px header) pushed the day's actual job
 * tickets below the fold. Two competing "look here" surfaces, and the operator
 * has to scroll past both to reach the thing they opened the app for.
 *
 * So: one at a time. The dispatch banner is the interrupt — it wins while it
 * is unread. Once the operator dismisses it, Continuing Projects takes the
 * slot.
 *
 * WHAT "DISMISSED" MEANS — and why there is no new column here.
 *
 * The mechanism already existed and is exactly right: dismissing the banner
 * POSTs to /api/notifications/mark-read, which stamps
 * `schedule_notifications.read = true` for those rows (caller-scoped). The
 * banner's own fetch filters on `read = false`. So dismissal is:
 *   - persistent   — it is a DB write, not component state; it survives
 *                    reload, app relaunch, and a different device
 *   - per-notification — a NEW dispatch inserts a NEW row with read = false,
 *                    so tomorrow's ticket announces itself even though
 *                    yesterday's was dismissed
 * That is strictly better than the `profiles.welcome_dismissed_at` pattern for
 * this problem: welcome_dismissed_at is a single global latch (dismiss once,
 * never again — correct for a one-time welcome, wrong for a recurring daily
 * dispatch, where it would silence every future ticket). Reusing the read
 * flag means no migration and no second mechanism to keep in sync.
 *
 * ONE EXEMPTION, ADDED DELIBERATELY (Aug 17): a span-carryover row — a
 * multi-day job that overran its booked end_date — has no other door on this
 * screen, and for the operators who have one the dispatch banner is unread
 * every day. Those rows show alongside the banner. The reasoning, the live
 * case, and the reason it must not be widened are on `spanCarryoverCount`
 * below.
 *
 * THE FAILURE MODE THIS FILE EXISTS TO PREVENT: suppressing Continuing
 * Projects because of a banner that was never there. The status is a
 * three-state, not a boolean — 'checking' is not 'unread'. Continuing Projects
 * shows the moment we know there is nothing to announce, and the caller is
 * responsible for always resolving 'checking' (see the watchdog in
 * NotificationBanner). An operator must never be left staring at an empty
 * screen waiting on a banner they never saw.
 */

/**
 * 'checking' — the unread-dispatch lookup has not answered yet.
 * 'unread'   — there is at least one undismissed dispatch notification.
 * 'none'     — nothing to announce (never any, or dismissed).
 */
export type DispatchBannerStatus = 'checking' | 'unread' | 'none';

export interface DispatchBannerStatusInput {
  /** Has the unread-notification lookup settled (resolved, failed, or timed out)? */
  loaded: boolean;
  /** Unread dispatch notifications for this operator. */
  unreadCount: number;
  /** Tapped the X during this render — the DB write is in flight behind it. */
  dismissedThisSession: boolean;
}

export function dispatchBannerStatus({
  loaded,
  unreadCount,
  dismissedThisSession,
}: DispatchBannerStatusInput): DispatchBannerStatus {
  // The X wins immediately. The mark-read POST is fire-and-forget behind it,
  // so the operator never watches the banner sit there waiting on a round
  // trip — and Continuing Projects slides up in the same frame.
  if (dismissedThisSession) return 'none';
  if (!loaded) return 'checking';
  return unreadCount > 0 ? 'unread' : 'none';
}

export interface ScheduleBannerInput {
  dispatchStatus: DispatchBannerStatus;
  /** Continuing projects AFTER the one-job-one-card dedup, not the raw fetch. */
  continuingCount: number;
  /**
   * How many of `continuingCount` are SPAN CARRYOVER — a multi-day job that ran
   * past its booked end_date and is still `scheduled`.
   *
   * THE ONE EXEMPTION FROM "ONE SURFACE AT A TIME", AND WHY IT IS NOT A
   * LOOPHOLE. Every other continuing-project row has a second door: it is on
   * today's schedule, or it is one date-bar swipe away, or the dispatch banner
   * itself is about it. An overrun span job has NONE — it stops matching the
   * day query (`end_date >= today` is false), and the Continuing Projects fetch
   * excludes `is_multi_day` from its stale-singles bucket. Until Aug 2026 its
   * only door on this whole screen was the amber "Multi-Day In Progress" panel,
   * which rendered UNCONDITIONALLY. Folding those rows in behind the banner
   * rule made a job that used to sit beside the banner disappear behind it.
   *
   * That is not a transient tap-to-clear: unread dispatch counts run 2–16 per
   * operator in production and a new dispatch inserts a new unread row daily,
   * so "banner unread" is the STEADY state for these accounts, and the banner
   * only clears the ids it fetched. Keontre Mcknight + JOB-2026-160762 (8/13
   * → 8/15, two days overrun, still `scheduled`) is the live case.
   *
   * So these rows — and only these — show alongside the banner. Do NOT widen
   * this to all of Continuing Projects: the founder asked for one surface at a
   * time precisely because two stacked cards pushed the day's tickets below the
   * fold, and every other row honours that.
   *
   * Optional so callers with no span carryover can leave it off.
   */
  spanCarryoverCount?: number;
}

export interface ScheduleBannerLayout {
  showDispatchBanner: boolean;
  showContinuingProjects: boolean;
}

export function resolveScheduleBanners({
  dispatchStatus,
  continuingCount,
  spanCarryoverCount = 0,
}: ScheduleBannerInput): ScheduleBannerLayout {
  return {
    showDispatchBanner: dispatchStatus === 'unread',
    // Only once we KNOW there is no banner. 'checking' holds it back for the
    // few hundred ms of the lookup so it does not render and then vanish
    // under an arriving banner — a flicker on the one card the founder asked
    // to make easier to see.
    //
    // UNLESS one of the rows is span carryover (see `spanCarryoverCount`), in
    // which case the card is the job's ONLY door and must not wait on a banner
    // that, for these operators, is unread every single day. The flicker
    // argument does not apply either: an exempt card does not vanish when the
    // banner arrives, it stays.
    showContinuingProjects:
      continuingCount > 0 && (dispatchStatus === 'none' || spanCarryoverCount > 0),
  };
}
