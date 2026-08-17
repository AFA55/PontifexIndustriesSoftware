/**
 * The rule behind "have one or the other" — and the guard against the way
 * that rule could strand an operator on an empty screen.
 */

import {
  dispatchBannerStatus,
  resolveScheduleBanners,
  type DispatchBannerStatus,
} from './schedule-banners';

describe('dispatchBannerStatus', () => {
  it('is still checking before the unread lookup answers', () => {
    expect(
      dispatchBannerStatus({ loaded: false, unreadCount: 0, dismissedThisSession: false })
    ).toBe('checking');
  });

  it('announces an undismissed dispatch', () => {
    expect(
      dispatchBannerStatus({ loaded: true, unreadCount: 1, dismissedThisSession: false })
    ).toBe('unread');
  });

  it('is none when the operator has nothing waiting', () => {
    expect(
      dispatchBannerStatus({ loaded: true, unreadCount: 0, dismissedThisSession: false })
    ).toBe('none');
  });

  it('clears the moment the X is tapped, without waiting on the mark-read POST', () => {
    // The DB write is in flight; the operator must not watch the banner sit
    // there. This is also what lets Continuing Projects appear in the same frame.
    expect(
      dispatchBannerStatus({ loaded: true, unreadCount: 3, dismissedThisSession: true })
    ).toBe('none');
  });

  it('honours the X even before the lookup settles', () => {
    // Dismiss fires on a banner rendered from a first fetch, then a refetch
    // flips `loaded` around it. A tapped X never un-taps.
    expect(
      dispatchBannerStatus({ loaded: false, unreadCount: 2, dismissedThisSession: true })
    ).toBe('none');
  });

  it('treats a failed or timed-out lookup as nothing to announce', () => {
    // NotificationBanner's catch and its watchdog both settle `loaded` with an
    // empty list. If they did not, `checking` would latch forever and the next
    // assertion in this file would be the operator's blank screen.
    expect(
      dispatchBannerStatus({ loaded: true, unreadCount: 0, dismissedThisSession: false })
    ).toBe('none');
  });
});

describe('resolveScheduleBanners', () => {
  it('shows ONLY the dispatch banner while it is unread — the founder’s ask', () => {
    expect(resolveScheduleBanners({ dispatchStatus: 'unread', continuingCount: 2 })).toEqual({
      showDispatchBanner: true,
      showContinuingProjects: false,
    });
  });

  it('hands the slot to Continuing Projects once the banner is dismissed', () => {
    expect(resolveScheduleBanners({ dispatchStatus: 'none', continuingCount: 2 })).toEqual({
      showDispatchBanner: false,
      showContinuingProjects: true,
    });
  });

  it('shows Continuing Projects immediately when there was never a banner', () => {
    // THE REGRESSION THIS FILE IS HERE FOR: gating on "was dismissed" instead
    // of "is showing" would hide continuing work from every operator who never
    // received a dispatch notification at all — nothing to dismiss, so nothing
    // ever unlocks.
    expect(resolveScheduleBanners({ dispatchStatus: 'none', continuingCount: 1 })).toEqual({
      showDispatchBanner: false,
      showContinuingProjects: true,
    });
  });

  it('holds Continuing Projects back only for the length of the lookup', () => {
    // Not a hidden card — a card that has not been told yet whether it is up.
    // Deliberately false so it cannot render and then be shoved aside by a
    // banner arriving 200ms later.
    expect(resolveScheduleBanners({ dispatchStatus: 'checking', continuingCount: 2 })).toEqual({
      showDispatchBanner: false,
      showContinuingProjects: false,
    });
  });

  it('shows nothing when there is no continuing work, whatever the banner is doing', () => {
    const statuses: DispatchBannerStatus[] = ['checking', 'unread', 'none'];
    for (const dispatchStatus of statuses) {
      expect(resolveScheduleBanners({ dispatchStatus, continuingCount: 0 }).showContinuingProjects).toBe(
        false
      );
    }
  });

  it('never puts both surfaces on screen at once — for ordinary continuing work', () => {
    // The whole point: two stacked cards pushed the day's job tickets below
    // the fold on a 375px phone. Holds for every row EXCEPT span carryover,
    // which is exempt on purpose (see the block of tests below).
    const statuses: DispatchBannerStatus[] = ['checking', 'unread', 'none'];
    for (const dispatchStatus of statuses) {
      for (const continuingCount of [0, 1, 5]) {
        const { showDispatchBanner, showContinuingProjects } = resolveScheduleBanners({
          dispatchStatus,
          continuingCount,
          spanCarryoverCount: 0,
        });
        expect(showDispatchBanner && showContinuingProjects).toBe(false);
      }
    }
  });

  it('renders a span-carryover row EVEN WHILE a dispatch banner is unread', () => {
    // THE REGRESSION THIS PINS (Aug 17, JOB-2026-160762 / Keontre Mcknight):
    // deleting the amber "Multi-Day In Progress" panel folded its rows into
    // Continuing Projects, which is banner-gated. That panel rendered
    // UNCONDITIONALLY, and an overrun span job has no other door on this
    // screen — it no longer matches the day query and is excluded from the
    // stale-singles bucket. With 2 unread dispatch notifications (16/13/9/7/5
    // across the fleet, one new row per day) the banner is the steady state,
    // so "dismiss it and the job appears" is not a real escape hatch.
    expect(
      resolveScheduleBanners({ dispatchStatus: 'unread', continuingCount: 1, spanCarryoverCount: 1 })
    ).toEqual({
      showDispatchBanner: true,
      showContinuingProjects: true,
    });
  });

  it('shows a span-carryover row before the banner lookup even settles', () => {
    // The 'checking' hold exists to stop a flicker — card up, banner arrives,
    // card gone. An exempt card never vanishes, so there is nothing to protect
    // it from, and the crew standing on the job should not wait on a fetch.
    expect(
      resolveScheduleBanners({ dispatchStatus: 'checking', continuingCount: 2, spanCarryoverCount: 1 })
        .showContinuingProjects
    ).toBe(true);
  });

  it('does NOT exempt ordinary continuing projects riding along with a span row', () => {
    // The exemption is about the SHAPE with no other door, not about the card.
    // A banner-unread screen with only on_hold / in_progress singles stays
    // one-surface-at-a-time — those rows are reachable from the day the office
    // scheduled them.
    expect(
      resolveScheduleBanners({ dispatchStatus: 'unread', continuingCount: 4, spanCarryoverCount: 0 })
        .showContinuingProjects
    ).toBe(false);
  });

  it('defaults to no exemption when the caller omits the span count', () => {
    expect(
      resolveScheduleBanners({ dispatchStatus: 'unread', continuingCount: 3 }).showContinuingProjects
    ).toBe(false);
  });

  it('still shows nothing when the span rows deduped down to zero', () => {
    // visibleSpanCarryover strips anything already painted as today's ticket.
    // An exemption for an empty list would reserve the slot for no rows.
    expect(
      resolveScheduleBanners({ dispatchStatus: 'unread', continuingCount: 0, spanCarryoverCount: 0 })
        .showContinuingProjects
    ).toBe(false);
  });

  it('counts the deduped list, not the raw fetch', () => {
    // visibleContinuing strips jobs already shown as today's ticket. Passing
    // continuingProjects.length would reserve the slot for a card that then
    // renders zero rows.
    expect(
      resolveScheduleBanners({ dispatchStatus: 'none', continuingCount: 0 }).showContinuingProjects
    ).toBe(false);
  });
});

describe('the two functions together', () => {
  const layoutFor = (input: Parameters<typeof dispatchBannerStatus>[0], continuingCount: number) =>
    resolveScheduleBanners({ dispatchStatus: dispatchBannerStatus(input), continuingCount });

  it('walks the founder’s sequence: banner, X, continuing projects', () => {
    const unread = { loaded: true, unreadCount: 1, dismissedThisSession: false };
    expect(layoutFor(unread, 2)).toEqual({
      showDispatchBanner: true,
      showContinuingProjects: false,
    });

    const afterX = { ...unread, dismissedThisSession: true };
    expect(layoutFor(afterX, 2)).toEqual({
      showDispatchBanner: false,
      showContinuingProjects: true,
    });
  });

  it('reloads the page after a dismissal and does NOT re-nag', () => {
    // A fresh mount: dismissedThisSession resets to false, but the mark-read
    // write means the `read = false` query returns nothing. This is why the
    // dismissal had to be a DB write and not component state — otherwise the
    // operator dismisses the same banner every time they open the app.
    expect(layoutFor({ loaded: true, unreadCount: 0, dismissedThisSession: false }, 2)).toEqual({
      showDispatchBanner: false,
      showContinuingProjects: true,
    });
  });

  it('lets TOMORROW’S dispatch interrupt again', () => {
    // A new schedule_notifications row is a new id with read = false, so the
    // unread count is 1 again on a fresh mount. Per-notification, not global —
    // the reason profiles.welcome_dismissed_at was the wrong pattern to copy.
    expect(layoutFor({ loaded: true, unreadCount: 1, dismissedThisSession: false }, 2)).toEqual({
      showDispatchBanner: true,
      showContinuingProjects: false,
    });
  });
});
