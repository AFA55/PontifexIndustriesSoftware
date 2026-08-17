/**
 * job_orders.site_compliance → what a CREW MEMBER reads on a phone.
 *
 * WHY THIS EXISTS (founder, Aug 2026): "site compliance lets make it more clear
 * and easier to understand — that looks like military time and really doesn't
 * say anything."
 *
 * He was looking at this, on a phone, in the field:
 *
 *     Orientation Datetime        2026-08-16T08:00
 *
 * Both halves were generated, not written. The label came from
 * `key.replace(/_/g, ' ')` over whatever keys happened to be in the jsonb, and
 * the value came from `String(value)` — so a raw ISO timestamp, and booleans
 * that rendered as the word "Required" next to a label that already said
 * "Required". Two operator surfaces (`my-jobs/[id]` and `my-jobs/[id]/jobsite`)
 * each had their OWN copy of that loop, with different fallbacks, so they could
 * and did disagree about the same job.
 *
 * This module is the single answer to "what does site_compliance SAY". Both
 * surfaces render whatever it returns and nothing else.
 *
 * TWO RULES IT ENCODES
 * ────────────────────
 * 1. THE LABEL IS AN INSTRUCTION, NOT A FIELD NAME. An orientation the crew has
 *    to attend at 8:00 AM before they touch anything is the most consequential
 *    thing on this panel; "Orientation Datetime" buries that under a column
 *    heading. `orientation_required` + `orientation_datetime` collapse into ONE
 *    line that tells them to go and when.
 * 2. NEVER `new Date('YYYY-MM-DD')`, NEVER `toISOString().split('T')[0]`.
 *    `orientation_datetime` is stored as a BARE LOCAL datetime string
 *    ('2026-08-16T08:00' — verified in production, no zone suffix). Handing that
 *    to `new Date()` is safe for a full datetime, but the date-only fallback is
 *    not, and this codebase has a standing off-by-one-day bug from exactly that.
 *    Dates go through `lib/dates.ts`. A value that DOES carry a zone suffix is
 *    converted to local rather than read as if the digits were local — see
 *    `formatComplianceDateTime`.
 *
 * KEY COVERAGE is pinned to the `SiteComplianceForm` interface in
 * `lib/jobsite-conditions.ts` (the schedule form's writer). Every key it
 * serializes has an explicit case here; anything else falls through to a
 * humanised generic so a new field degrades to "readable" rather than "raw".
 *
 * Pure: no React, no fetch, no Date.now(). Unit-tested in
 * `site-compliance-display.test.ts`.
 */
import { formatDay, toLocalYMD } from '@/lib/dates';

/** 'critical' = do this or you cannot work. 'info' = context. */
export type ComplianceTone = 'critical' | 'info';

export interface ComplianceItem {
  /** Stable React key. Merged entries get a synthetic key ('orientation'). */
  key: string;
  /** What the crew must DO, in plain words. */
  label: string;
  /**
   * The concrete detail — a time, a badge type, a name. EMPTY when the label
   * already says everything (a bare `true` flag), and the renderer must then
   * show the label alone rather than inventing a "Yes".
   */
  value: string;
  /** Optional supporting sentence, one line. */
  detail?: string;
  tone: ComplianceTone;
  /** 'block' = free text that has to wrap; 'row' = label left, value right. */
  layout: 'row' | 'block';
}

/** Keys this module consumes itself; the generic pass must skip them. */
const HANDLED_KEYS = new Set([
  'attachment_urls', // rendered as a PhotoViewer by the pages, never as text
  'orientation_required',
  'orientation_datetime',
  'badging_required',
  'badging_type',
  'photos_prohibited',
  'facility_name',
  'facility_id',
  'facility_requirements',
  'special_instructions',
]);

/** Free text longer than this wraps as a block instead of a right-aligned value. */
const BLOCK_TEXT_THRESHOLD = 48;

function text(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** `true` / `'true'` / `'yes'` / `1` all mean on. Mirrors the writer's `toBool`. */
function isOn(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === '1';
  }
  return false;
}

/** "Sun, Aug 16 · 8:00 AM" from already-LOCAL parts. Null if the day is junk. */
function sayDateTime(ymd: string, hh?: string, mm?: string): string | null {
  const day = formatDay(ymd);
  if (day.toLowerCase().includes('invalid')) return null;
  if (hh === undefined || mm === undefined) return day;
  const h = Number(hh);
  if (!Number.isFinite(h) || h > 23) return day;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${day} · ${hour12}:${mm} ${suffix}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * A stored datetime → something a person says out loud: "Sun, Aug 16 · 8:00 AM".
 *
 * Accepts the bare local form the schedule form writes ('2026-08-16T08:00'),
 * a space separator, seconds, and a date with no time at all. Returns null for
 * anything that isn't a date, so callers can fall back rather than print
 * "Invalid Date".
 *
 * The date half goes through `formatDay` (which parses at LOCAL midnight). The
 * time half is read straight off the string — it was never UTC, so it must not
 * be shifted. An 8:00 orientation is 8:00 on site.
 *
 * A TRAILING ZONE IS A DIFFERENT INSTANT, AND IS NOT IGNORED. Nothing writes
 * one today — `serializeSiteCompliance` only ever stores the bare local form,
 * and every production row confirms it — but the old prefix match read
 * '2026-08-16T08:00:00Z' as the digits 08:00 and printed "8:00 AM" local,
 * which in Patriot's timezone is four or five hours wrong for a time the crew
 * has to physically be somewhere. If a value declares its offset we honour it
 * and convert to the reader's local wall clock; if the conversion fails we
 * return null and the caller falls back, rather than guessing.
 */
export function formatComplianceDateTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  const m = s.match(
    /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?/
  );
  if (!m) return null;
  const [, ymd, hh, mm, zone] = m;

  if (zone) {
    const at = new Date(s);
    if (Number.isNaN(at.getTime())) return null;
    return sayDateTime(toLocalYMD(at), pad2(at.getHours()), pad2(at.getMinutes()));
  }
  return sayDateTime(ymd, hh, mm);
}

/** snake_case → Title Case, with units kept on a distance field. */
function humanizeKey(key: string): string {
  const base = key.replace(/_ft$/, '').replace(/_/g, ' ');
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

function genericValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') return 'Required';
  const asDate = formatComplianceDateTime(value);
  if (asDate) return asDate;
  const raw = text(value);
  // Distances keep their units — a bare "50" beside "Water Distance" is a
  // number without a meaning.
  if (/_ft$/.test(key) && /^-?\d+(\.\d+)?$/.test(raw)) return `${raw} ft`;
  return raw;
}

/**
 * The ordered, deduplicated list of compliance lines for one job.
 *
 * Ordering is by consequence, not by jsonb key order: the things that stop a
 * crew getting on site come first, context last. `attachment_urls` is never
 * included — both pages render it as a PhotoViewer.
 */
export function buildComplianceItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sc: Record<string, any> | null | undefined
): ComplianceItem[] {
  const c = sc && typeof sc === 'object' && !Array.isArray(sc) ? sc : {};
  const items: ComplianceItem[] = [];

  // ── 1. ORIENTATION — the whole reason this panel got rewritten ───────────
  // `orientation_required` and `orientation_datetime` are ONE fact wearing two
  // keys, and in production they routinely disagree: the office types a time
  // and leaves the checkbox off (3 of the 5 live jobs with a time set). Showing
  // them as two rows produced "Orientation Required: Required" above a raw ISO
  // string. A time on record means there is an orientation to attend.
  const when = formatComplianceDateTime(c.orientation_datetime);
  if (when) {
    items.push({
      key: 'orientation',
      label: 'Attend site orientation',
      value: when,
      detail: 'Be there before you start work.',
      tone: 'critical',
      layout: 'row',
    });
  } else if (isOn(c.orientation_required)) {
    items.push({
      key: 'orientation',
      label: 'Attend site orientation',
      value: 'Time not set',
      detail: 'Check with the office before you start work.',
      tone: 'critical',
      layout: 'row',
    });
  }

  // ── 2. BADGING — you do not get through the gate without it ─────────────
  const badgeType = text(c.badging_type);
  if (isOn(c.badging_required) || badgeType) {
    items.push({
      key: 'badging',
      label: 'Badge required to get on site',
      // A bare `true` says the thing required; it must not render as "Yes".
      value: badgeType,
      detail: badgeType ? undefined : 'Ask the site contact where to get badged.',
      tone: 'critical',
      layout: 'row',
    });
  }

  // ── 3. PHOTOS — a secure facility, and it changes the crew's own workflow.
  // `photos_prohibited` is the flag that waives the job-photo requirement at
  // closeout, so this is not trivia: it tells them why the camera step is gone.
  if (isOn(c.photos_prohibited)) {
    items.push({
      key: 'photos_prohibited',
      label: 'No photos on this site',
      value: '',
      detail: 'Job photos are waived here — do not use your camera.',
      tone: 'critical',
      layout: 'row',
    });
  }

  // ── 4. WHERE THEY ARE REPORTING ─────────────────────────────────────────
  const facilityName = text(c.facility_name);
  if (facilityName) {
    items.push({
      key: 'facility_name',
      label: 'Facility',
      value: facilityName,
      tone: 'info',
      layout: 'row',
    });
  }
  const facilityId = text(c.facility_id);
  if (facilityId) {
    items.push({
      key: 'facility_id',
      label: 'Facility ID',
      value: facilityId,
      tone: 'info',
      layout: 'row',
    });
  }

  // ── 5. FREE TEXT — always a block. These run to several sentences in
  // production ("Parking lot will be tight most likely…"), and a long string
  // right-aligned against a label is unreadable at 375px.
  const facilityReqs = text(c.facility_requirements);
  if (facilityReqs) {
    items.push({
      key: 'facility_requirements',
      label: 'Facility requirements',
      value: facilityReqs,
      tone: 'info',
      layout: 'block',
    });
  }
  const instructions = text(c.special_instructions);
  if (instructions) {
    items.push({
      key: 'special_instructions',
      label: 'From the office',
      value: instructions,
      tone: 'info',
      layout: 'block',
    });
  }

  // ── 6. ANYTHING ELSE the office starts writing into this jsonb. It should
  // degrade to readable, not to raw snake_case beside a raw value.
  for (const [key, value] of Object.entries(c)) {
    if (HANDLED_KEYS.has(key)) continue;
    if (value === null || value === undefined || value === false || value === '') continue;
    if (Array.isArray(value)) continue;
    if (typeof value === 'object') continue;
    const display = genericValue(key, value);
    if (!display) continue;
    items.push({
      key,
      label: humanizeKey(key),
      value: display,
      tone: 'info',
      layout: display.length > BLOCK_TEXT_THRESHOLD ? 'block' : 'row',
    });
  }

  return items;
}
