/**
 * lib/job-photo-day.ts — WHICH of a job's photos were filed TODAY.
 *
 * ── WHY THIS EXISTS (founder, Aug 20 2026) ──────────────────────────────────
 * "Nate ... still feels it's annoying to do the digital ticket and wants to go
 * back to paper ... he has to submit pictures twice, make it so it only asks
 * for pictures once."
 *
 * He was right, and it was one requirement asked twice — not two requirements.
 * Both operator screens upload into the SAME bucket (`job-photos`) and POST to
 * the SAME endpoint (`/api/job-orders/[id]/photos`), which appends into the
 * SAME column (`job_orders.photo_urls`):
 *
 *   work-performed  → pathPrefix `{jobId}`             → "Job Photos (optional)"
 *   day-complete    → pathPrefix `{jobId}/completion`  → "Completion Photos *"
 *
 * day-complete's gate only ever inspected its OWN local `completionPhotos`
 * state, which starts empty on every mount. So a crew that photographed the
 * work minutes earlier was told to photograph it again. Production bears this
 * out — two upload clusters, same operator, same job, same day, minutes apart:
 * JOB-2026-654657 (20:11 then 20:12), JOB-2026-262301 (14:14 then 14:17),
 * JOB-2026-160762 (16:40:34 then 16:41:09 — thirty-five seconds).
 *
 * ── WHY THE DATE HAS TO COME OUT OF THE FILENAME ────────────────────────────
 * `job_orders.photo_urls` is a flat `text[]` on the job row. It carries no date
 * and no per-day dimension (verified against `information_schema.columns` —
 * there is no dated job-photo table to read instead). But every upload written
 * by PhotoUploader is named
 *
 *     `${pathPrefix}-${Date.now()}-${random}.${ext}`
 *
 * so the epoch-millisecond stamp is already in the object path. All 81 photo
 * URLs in production today carry it (checked, not assumed).
 *
 * A date matters, and "any photo on the job" is NOT good enough: on a multi-day
 * job that would let day 1's photo satisfy day 5's completion gate, and the
 * office bills and defends the work with these. Asked ONCE PER JOB PER DAY is
 * the goal — not optional.
 *
 * An unparseable URL is deliberately treated as NOT-today. Failing that way
 * costs one prompt; failing the other way silently drops the evidence
 * requirement, which is the expensive mistake.
 *
 * ── "TODAY" IS THE SHIFT'S DAY, NOT THE PHONE'S DATE ────────────────────────
 * A crew working past midnight was still asked twice: a photo filed at 23:50
 * does not share a calendar date with a 00:05 closeout. Production is not
 * hypothetical about this — there is a job photo uploaded at 02:00 ET.
 *
 * The founder's model already answers it, and this file does not get to invent
 * a second answer. `docs/plans/NIGHT_SHIFT_AND_LATE_CLOSEOUT.md`:
 *
 *     "A shift belongs to the day it STARTED. An operator clocking in at 21:00
 *      Tuesday and out at 06:00 Wednesday worked *Tuesday*."
 *
 * So the photo day is the operator's SHIFT: evidence filed at any point from
 * clock-in until now belongs to this shift, whatever midnight did in between.
 * The device's calendar day is kept as well, never replaced — the union only
 * ever widens, so a crew that never clocked in behaves exactly as before.
 *
 * Two things this deliberately does NOT do:
 *
 *   1. It does not introduce a rollover hour ("a day ends at 4am"). That would
 *      be a third definition of the day competing with the two the codebase
 *      already carries. The shift start IS the boundary.
 *   2. It does not trust an unbounded card. The same doc records an 88-hour
 *      timecard that went through payroll and ten cards closed at exactly
 *      00:00:00 — forgotten clock-outs, not overnight work. A card that claims
 *      to have been running longer than `MAX_SHIFT_HOURS` is treated as a
 *      machine artefact and ignored, because widening the window to four days
 *      is precisely how a day-1 photo would come to satisfy day 5.
 *
 * Pure and unit-tested (lib/job-photo-day.test.ts) — no Supabase, no clock
 * beyond the caller's own `toLocalYMD()`.
 */

import { toLocalYMD } from './dates';

/**
 * The stamp PhotoUploader writes, read off the END of the object's basename:
 * `...-1787170264849-hvrg7.jpg`.
 *
 * Anchored to the last path segment on purpose. A job id is a UUID whose
 * longest group is 12 characters, so no part of the folder path can pose as a
 * 13-digit millisecond stamp — but matching the whole URL would still be
 * needless surface, and signed URLs carry a `?token=` that must come off first.
 */
const STAMP_RE = /-(\d{13})-[^/]*$/;

/** Epoch ms this photo was uploaded, or null when the URL doesn't say. */
export function photoUploadedAtMs(url: unknown): number | null {
  if (typeof url !== 'string') return null;
  // Query/hash first: a signed Supabase URL is `...jpg?token=eyJ...`, and the
  // token is base64url — it can end in digits and would otherwise be searched.
  const path = url.trim().split(/[?#]/)[0];
  if (!path) return null;
  const m = path.match(STAMP_RE);
  if (!m) return null;
  const ms = Number(m[1]);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * The LOCAL calendar day this photo was uploaded (`YYYY-MM-DD`), or null.
 *
 * Local, never `toISOString()`: a photo taken at 8pm ET is stored as the next
 * UTC day, and an operator closing out his evening would be told his own
 * photos belong to tomorrow.
 */
export function photoUploadedOnYMD(url: unknown): string | null {
  const ms = photoUploadedAtMs(url);
  return ms === null ? null : toLocalYMD(new Date(ms));
}

/**
 * The subset of `urls` uploaded on `ymd` (default: the device's today).
 *
 * Order and exact strings are preserved so the caller can render the real
 * photos back to the operator — "3 photos already added today" is only
 * believable if he can see which three.
 */
export function photosFiledOn(urls: unknown, ymd: string = toLocalYMD()): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.filter(
    (u): u is string => typeof u === 'string' && photoUploadedOnYMD(u) === ymd
  );
}

/**
 * The longest a clock cycle may claim to have been running and still be read as
 * a real shift.
 *
 * Real overnight work tops out around twelve hours (in 18:00, out 06:00). Past
 * eighteen, the record says the card is an artefact rather than a shift: ten
 * production cards end at exactly `00:00:00` and one ran 88 hours across four
 * days (`docs/plans/NIGHT_SHIFT_AND_LATE_CLOSEOUT.md`). Honouring one of those
 * would stretch the photo window across days and let day 1's photo close day 5,
 * which is the one regression this feature must not cause.
 */
export const MAX_SHIFT_HOURS = 18;

const MAX_SHIFT_MS = MAX_SHIFT_HOURS * 60 * 60 * 1000;

/** A timecard row, as `/api/timecard/history` hands it back. */
export interface ShiftCardLike {
  clock_in_time?: string | null;
  clock_out_time?: string | null;
}

/** ms, or null — accepts the ISO strings timecards carry. */
function toMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * A shift start that may be used as a photo-window boundary, or null.
 *
 * Rejects the future (a clock skew must never widen the window), and rejects
 * anything older than `MAX_SHIFT_HOURS` — see the constant.
 */
export function normalizeShiftStartMs(
  shiftStartMs: unknown,
  nowMs: number = Date.now()
): number | null {
  if (typeof shiftStartMs !== 'number' || !Number.isFinite(shiftStartMs)) return null;
  if (shiftStartMs <= 0 || shiftStartMs > nowMs) return null;
  return nowMs - shiftStartMs > MAX_SHIFT_MS ? null : shiftStartMs;
}

/**
 * When the operator's current shift began, from their recent timecards.
 *
 * The LATEST clock-in wins. That is what makes "the shift owns its day" safe on
 * the following afternoon: a crew that clocked in again this morning is on a new
 * shift, and last night's window is gone the moment they do.
 *
 * `clock_out_time` is deliberately not consulted. Filing the ticket from the
 * truck after clocking out is normal — the founder's own case, a job closed out
 * the next morning — and the photos in question were taken DURING the shift
 * either way. The `MAX_SHIFT_HOURS` cap, not the clock-out, is what bounds this.
 */
export function currentShiftStartMs(
  cards: unknown,
  nowMs: number = Date.now()
): number | null {
  if (!Array.isArray(cards)) return null;
  let latest: number | null = null;
  for (const card of cards) {
    if (!card || typeof card !== 'object') continue;
    const ms = toMs((card as ShiftCardLike).clock_in_time);
    if (ms === null || ms > nowMs) continue;
    if (latest === null || ms > latest) latest = ms;
  }
  return normalizeShiftStartMs(latest, nowMs);
}

/**
 * The subset of `urls` that counts as evidence for the shift being closed out.
 *
 * A photo qualifies if EITHER
 *   - it was filed on the device's local calendar day (the original rule, kept
 *     intact so a crew with no timecard behaves exactly as it did before), OR
 *   - it was filed at or after the shift started (the night-shift rule).
 *
 * A union, never a replacement: this can only ever accept more photos than the
 * wall clock alone, so no path through it can newly demand a second photo.
 *
 * It still cannot reach across days of a multi-day job. The window's back edge
 * is the shift's own clock-in, and a shift that claims to predate
 * `MAX_SHIFT_HOURS` is discarded outright.
 */
export function photosFiledThisShift(
  urls: unknown,
  opts: { shiftStartMs?: number | null; nowMs?: number; ymd?: string } = {}
): string[] {
  if (!Array.isArray(urls)) return [];
  const nowMs = opts.nowMs ?? Date.now();
  const ymd = opts.ymd ?? toLocalYMD(new Date(nowMs));
  const startMs = normalizeShiftStartMs(opts.shiftStartMs, nowMs);

  return urls.filter((u): u is string => {
    if (typeof u !== 'string') return false;
    const ms = photoUploadedAtMs(u);
    if (ms === null) return false; // undated → not today, as above
    if (toLocalYMD(new Date(ms)) === ymd) return true;
    return startMs !== null && ms >= startMs && ms <= nowMs;
  });
}
