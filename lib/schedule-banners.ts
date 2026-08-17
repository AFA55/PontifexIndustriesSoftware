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
}

export interface ScheduleBannerLayout {
  showDispatchBanner: boolean;
  showContinuingProjects: boolean;
}

export function resolveScheduleBanners({
  dispatchStatus,
  continuingCount,
}: ScheduleBannerInput): ScheduleBannerLayout {
  return {
    showDispatchBanner: dispatchStatus === 'unread',
    // Only once we KNOW there is no banner. 'checking' holds it back for the
    // few hundred ms of the lookup so it does not render and then vanish
    // under an arriving banner — a flicker on the one card the founder asked
    // to make easier to see.
    showContinuingProjects: dispatchStatus === 'none' && continuingCount > 0,
  };
}
