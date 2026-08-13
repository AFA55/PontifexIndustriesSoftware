/**
 * WHEN TO CHASE THE CREW ABOUT AN UNSIGNED UTILITY WAIVER, AND WHAT TO SAY.
 *
 * FOUNDER (Aug 13): "We also need a notification to go out to THE OPERATOR based
 * on their estimated arrival, if the utility waiver has not been signed yet — to
 * make them get it signed by the on-site contact, or to resend it. It's
 * important we get that document signed, and we need them to remember to get it
 * signed. Use the exact same verbiage as the ticket."
 *
 * Pure timing + wording, so both are unit-testable without a database. The cron
 * (app/api/cron/waiver-signature-reminders) supplies the clock.
 *
 * WHY IT MATTERS: the waiver is what puts responsibility for unmarked conduit,
 * post-tension cable and buried utilities on the customer. Unsigned, the company
 * carries a cut it did not cause. The send half already worked; nothing chased
 * the signature, and exactly ONE job in production has ever come back signed.
 *
 * ── ON "ESTIMATED ARRIVAL" ────────────────────────────────────────────────
 * Deliberately measured from `in_route_at`, NOT from the job's `arrival_time`.
 * `arrival_time` is a bare clock string ("08:00") with no date or zone, and
 * turning it into an instant means guessing a timezone — the exact class of
 * mistake that produced the "213 hours on site" reading. A wrong guess here
 * either nags a crew still driving or stays silent through a whole job.
 *
 * `in_route_at + travel` is honest with what we actually know. When the GPS ETA
 * from batch 3 lands (ETA computed from where the crew really is when they tap
 * In Route, not from the shop), pass it in as `etaMs` and it takes over.
 */

/** Conservative stand-in for travel time until the real ETA exists. */
export const ASSUMED_TRAVEL_MINUTES = 30;

const MIN = 60 * 1000;

export type WaiverChaseKey = 'due' | 'followup' | 'overdue';

export interface WaiverChaseStep {
  key: WaiverChaseKey;
  title: string;
  /** Built per job so the customer's name is in the operator's hand. */
  message: (customerName: string) => string;
}

/**
 * The three escalations, in the paper ticket's own words.
 *
 * Item 1 of the printed checklist reads, verbatim: "Have contractor sign
 * understandings prior to working and sign when complete." That instruction is
 * what the crew already knows, so it leads every message — the founder asked for
 * the ticket's wording precisely so this does not read like a new rule.
 */
const STEPS: Record<WaiverChaseKey, WaiverChaseStep> = {
  due: {
    key: 'due',
    title: 'Get the waiver signed before you start',
    message: (c) =>
      `Have contractor sign understandings prior to working and sign when complete. ` +
      `${c} has not signed the utility waiver yet. Get the on-site contact to sign it now, or resend it to them — tap to open the waiver.`,
  },
  followup: {
    key: 'followup',
    title: 'Utility waiver still not signed',
    message: (c) =>
      `${c} still has not signed the utility waiver. Until it is signed, the customer has not accepted responsibility for locating and marking conduit, post-tension cable, rebar, plumbing and electrical. ` +
      `Get the on-site contact to sign it, or resend the link.`,
  },
  overdue: {
    key: 'overdue',
    title: 'Work under way with no signed waiver',
    message: (c) =>
      `You are working on ${c} and the utility waiver is still unsigned. This is the document that protects us if something unmarked gets cut. ` +
      `Get the on-site contact to sign it now, or resend it and tell the office.`,
  },
};

/** Minutes AFTER the estimated arrival at which each nudge fires. */
const SCHEDULE: Array<{ key: WaiverChaseKey; afterMinutes: number }> = [
  { key: 'overdue', afterMinutes: 120 },
  { key: 'followup', afterMinutes: 45 },
  { key: 'due', afterMinutes: 0 },
];

export interface WaiverChaseInput {
  nowMs: number;
  /** ISO timestamp of the crew's first In Route tap. */
  inRouteAt: string | null | undefined;
  /**
   * Real estimated arrival (epoch ms), once batch 3's GPS ETA exists. When
   * supplied it wins over the assumed travel time.
   */
  etaMs?: number | null;
}

/**
 * The furthest-along step that is due, or null if it is too early to nag.
 *
 * Returns the LATEST applicable step rather than the earliest so that a crew
 * whose job has been running for hours gets the urgent wording, not the gentle
 * one — the reminder_log dedup means each step still fires at most once, and a
 * late first run must not start the ladder from the bottom.
 */
export function waiverChaseStep({ nowMs, inRouteAt, etaMs }: WaiverChaseInput): WaiverChaseStep | null {
  if (!inRouteAt && etaMs == null) return null;

  let arrivalMs: number;
  if (etaMs != null && Number.isFinite(etaMs)) {
    arrivalMs = etaMs;
  } else {
    const started = new Date(String(inRouteAt)).getTime();
    if (!Number.isFinite(started)) return null;
    arrivalMs = started + ASSUMED_TRAVEL_MINUTES * MIN;
  }

  const elapsed = nowMs - arrivalMs;
  if (elapsed < 0) return null; // still driving

  for (const s of SCHEDULE) {
    if (elapsed >= s.afterMinutes * MIN) return STEPS[s.key];
  }
  return null;
}
