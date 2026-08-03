/**
 * Pure formatting/mapping helpers for operator work-item submissions.
 *
 * The operator's work-performed page captures rich detail (per-hole bit size /
 * depth, cuts with LF / depth / wet-dry / areas, per-item notes, a difficulty
 * pick) into `work_items.details_json`. These helpers turn that detail into
 * the compact human-readable strings used by:
 *   - the `job_orders.work_performed` summary (feeds invoices + customer portal)
 *   - admin renders (job detail Daily Progress, Active Jobs daily work,
 *     WorkHistoryTimeline, completed-print)
 *
 * Keep these pure — they are unit-tested in lib/work-items-format.test.ts.
 */

export interface WorkItemLike {
  work_type?: string | null;
  quantity?: number | null;
  core_quantity?: number | null;
  core_size?: string | null;
  core_depth_inches?: number | null;
  linear_feet_cut?: number | null;
  cut_depth_inches?: number | null;
  day_number?: number | null;
  notes?: string | null;
  details_json?: any;
}

/** Difficulty labels the operator picks ↔ the 1–5 accessibility_rating column.
 *  Mapping mirrors the one already used by /api/job-orders/[id]/daily-log. */
export const DIFFICULTY_TO_RATING: Record<string, number> = {
  easy: 1,
  moderate: 2,
  medium: 3,
  difficult: 4,
  hard: 5,
};

export function difficultyToRating(label: string | null | undefined): number | null {
  if (!label) return null;
  return DIFFICULTY_TO_RATING[String(label).toLowerCase().trim()] ?? null;
}

/** Reverse mapping for display badges (1 easy, 2–3 moderate, 4–5 difficult).
 *  2 MUST label as Moderate: the picker maps moderate→2, and legacy rows used
 *  2=moderate too — bucketing 2 as Easy showed the office the wrong severity. */
export function ratingToDifficultyLabel(rating: number | null | undefined): string | null {
  if (rating == null || !isFinite(Number(rating))) return null;
  const r = Number(rating);
  if (r <= 0) return null;
  if (r <= 1) return 'Easy';
  if (r <= 3) return 'Moderate';
  return 'Difficult';
}

const n = (v: unknown): number => {
  const x = Number(v);
  return isFinite(x) ? x : 0;
};

/** `2× 4" @ 10"` style descriptor for one core-drilling hole spec. */
function describeHole(h: any): string {
  const qty = n(h?.quantity) || 1;
  const size = h?.bitSize ? String(h.bitSize).replace(/"$/, '') : null;
  const depth = n(h?.depthInches);
  let s = `${qty}×`;
  if (size) s += ` ${size}"`;
  if (depth > 0) s += ` @ ${depth}"`;
  if (h?.cutSteel) s += ' steel';
  return s;
}

/** Trims float noise off computed totals (48.000000001 → 48). */
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** `4' × 6' @ 8"` descriptor for one demolition/removal area (break & remove,
 *  jack hammering, chipping, Brokk). `thickness` and `depth` are the same
 *  measurement under two names across the three quick-entry modals. */
function describeDemoArea(a: any): string {
  let s = `${round2(n(a?.length))}' × ${round2(n(a?.width))}'`;
  const thick = n(a?.thickness) || n(a?.depth);
  if (thick > 0) s += ` @ ${round2(thick)}"`;
  return s;
}

/** `120 LF @ 6"` style descriptor for one sawing cut spec. */
function describeCut(c: any): string {
  const lf = n(c?.linearFeet);
  const depth = n(c?.cutDepth);
  let s = lf > 0 ? `${lf} LF` : 'cut';
  if (depth > 0) s += ` @ ${depth}"`;
  const flags: string[] = [];
  if (c?.cutSteel) flags.push('steel');
  if (c?.overcut) flags.push('overcut');
  if (c?.chainsawed) flags.push('chainsawed');
  if (flags.length) s += ` (${flags.join(', ')})`;
  return s;
}

/**
 * Compact one-line detail for a single work_items row, expanding details_json
 * when present and falling back to the flat columns.
 *
 * Examples:
 *   Core drilling, 3 holes  → `2× 4" @ 10", 1× 6" @ 12"`
 *   Sawing                  → `120 LF @ 6" (wet)`
 *   Flat columns only       → `4 cores (4" @ 10")` / `80 LF @ 6"`
 * Returns '' when there is nothing beyond the label + quantity.
 */
export function workItemDetailLine(item: WorkItemLike): string {
  const d = item.details_json;

  // Core drilling — enumerate every hole (the founder's original complaint was
  // that only "Core Drilling ×1" survived; details_json has ALL holes).
  if (d && Array.isArray(d.holes) && d.holes.length > 0) {
    return d.holes.map(describeHole).join(', ');
  }

  // Sawing — enumerate cuts + wet/dry.
  if (d && Array.isArray(d.cuts) && d.cuts.length > 0) {
    const cuts = d.cuts.map(describeCut).join(', ');
    return d.cutType ? `${cuts} (${d.cutType})` : cuts;
  }

  // Demolition / removal quick entries (break & remove, jack hammering,
  // chipping, Brokk) — a TOP-LEVEL `areas[]`. Sawing areas live nested under
  // `cuts[i].areas`, so this branch can't collide with the sawing shape above.
  if (d && Array.isArray(d.areas) && d.areas.length > 0) {
    const total =
      n(d.totalSquareFeet) ||
      d.areas.reduce((sum: number, a: any) => sum + n(a?.length) * n(a?.width), 0);
    let s = `${round2(total)} sq ft`;
    const list = d.areas.map(describeDemoArea).join(', ');
    if (list) s += ` (${list})`;
    const meta = [d.method, d.equipment].filter(Boolean).map(String);
    if (meta.length) s += ` — ${meta.join(': ')}`;
    return s;
  }

  // Fallback: flat back-compat columns (first-hole flattening, LF totals).
  const parts: string[] = [];
  if (n(item.core_quantity) > 0) {
    let core = `${n(item.core_quantity)} core${n(item.core_quantity) === 1 ? '' : 's'}`;
    const spec: string[] = [];
    if (item.core_size) spec.push(`${String(item.core_size).replace(/"$/, '')}"`);
    if (n(item.core_depth_inches) > 0) spec.push(`@ ${n(item.core_depth_inches)}"`);
    if (spec.length) core += ` (${spec.join(' ')})`;
    parts.push(core);
  }
  if (n(item.linear_feet_cut) > 0) {
    let lf = `${n(item.linear_feet_cut)} LF`;
    if (n(item.cut_depth_inches) > 0) lf += ` @ ${n(item.cut_depth_inches)}"`;
    parts.push(lf);
  }
  return parts.join(', ');
}

const truncate = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;

/**
 * The operator's per-item QUICK NOTE — prep, access, delays, anything that
 * affected the job. CANONICAL HOME: the `work_items.notes` column. Older rows
 * (and the pre-Aug-2026 core/sawing "Additional Notes" textareas) only wrote
 * `details_json.notes`, so fall back to it when the column is empty.
 */
export function workItemQuickNote(item: WorkItemLike): string {
  const flat = typeof item.notes === 'string' ? item.notes.trim() : '';
  if (flat) return flat;
  const nested = item.details_json?.notes;
  return typeof nested === 'string' ? nested.trim() : '';
}

/** One work item as a readable summary fragment: label ×qty + detail + note.
 *  The note cap is deliberately generous (160, not 80): the founder's ask is a
 *  narrative of conditions, and one sentence of "set poly, access was tight,
 *  waited on the contractor" is the point of the field. */
export function summarizeWorkItem(item: WorkItemLike): string {
  const label = item.work_type || 'Work';
  const qty = n(item.quantity) || 1;
  let s = `${label} ×${qty}`;
  const detail = workItemDetailLine(item);
  if (detail) s += ` (${detail})`;
  const note = workItemQuickNote(item);
  // Collapse dictation newlines — this string is prose in one line.
  if (note) s += ` — ${truncate(note.replace(/\s*\n+\s*/g, ' '), 160)}`;
  return s;
}

// ── Customer-facing boundary ────────────────────────────────────────────────
// The quick note is the operator's INTERNAL narrative for the office (prep,
// access, delays, who held us up). Everything below strips it, so no caller —
// including one passing a client-supplied array — can put it in front of a
// customer.

/** The ONLY work-item shape allowed onto a customer-signed completion PDF. */
export interface CompletionPdfWorkItem {
  type: string;
  quantity?: number;
  description: string;
}

type LooseWorkItem = WorkItemLike & {
  type?: string | null;
  name?: string | null;
  unit?: string | null;
  depth?: number | null;
  /** The offline/localStorage shape stores measurements under `details`, not
   *  `details_json` — without this the PDF description came out blank. */
  details?: any;
};

/**
 * Normalizes any work-item shape (DB row OR client-posted object) down to
 * measurements only. `notes` and `details_json.notes` are dropped here, at the
 * trust boundary — callers cannot opt back in.
 */
export function toCompletionPdfWorkItems(
  items: unknown[] | null | undefined
): CompletionPdfWorkItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const item = (raw || {}) as LooseWorkItem;
    const type = item.work_type || item.type || item.name || 'Work Item';
    // Prefer the real measurements; fall back to the depth for legacy client
    // payloads that carry no details_json. Quantity is deliberately NOT
    // repeated here — the PDF renders it in its own Qty column.
    // `details` is the offline/localStorage alias of `details_json`.
    let description = workItemDetailLine({
      ...item,
      details_json: item.details_json ?? item.details,
    });
    if (!description) {
      const depth = n(item.depth);
      description = depth > 0 ? `${depth}" depth` : '';
    }
    const qtyOut = Number(item.quantity);
    return {
      type: String(type),
      ...(isFinite(qtyOut) ? { quantity: qtyOut } : {}),
      description,
    };
  });
}

/**
 * Strips internal notes out of a `daily_job_logs.work_performed` jsonb payload
 * before it crosses a PUBLIC (token-only, unauthenticated) boundary. Applied on
 * READ, not on write: admin surfaces (WorkHistoryTimeline, job detail) render
 * these notes on purpose, and read-side stripping also protects rows already
 * written.
 */
export function stripInternalNotes(workPerformed: unknown): unknown {
  // Recursive: the offline/localStorage payload carries the quick note TWICE —
  // once at the top level and once mirrored into `details.notes` (the mirror is
  // deliberate, for legacy readers). Stripping only the outer key left the same
  // prose on the public endpoint, so every nested object is scrubbed too.
  const scrub = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== 'object') return value;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      // `quickNotes` is forward-looking: no writer uses that key today, but if
      // one is ever added for the internal note it is scrubbed from day one.
      if (key === 'notes' || key === 'quickNotes') continue;
      out[key] = scrub(v);
    }
    return out;
  };
  // Not just arrays: WorkHistoryTimeline already anticipates object-shaped
  // legacy rows, and `scrub` returns primitives unchanged, so this is safe.
  return scrub(workPerformed);
}

/**
 * Builds the `job_orders.work_performed` string from ALL of a job's work
 * items. Single-day: `item; item`. Multi-day: `Day 1: item, item | Day 2: …`.
 * This string feeds invoices + the customer portal — keep it readable prose,
 * never JSON.
 */
export function buildWorkPerformedSummary(items: WorkItemLike[]): string {
  if (!items || items.length === 0) return '';

  const byDay = new Map<number, WorkItemLike[]>();
  for (const item of items) {
    const day = n(item.day_number) || 1;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(item);
  }

  const dayKeys = Array.from(byDay.keys()).sort((a, b) => a - b);
  if (dayKeys.length === 1) {
    return byDay.get(dayKeys[0])!.map(summarizeWorkItem).join('; ');
  }
  return dayKeys
    .map((d) => `Day ${d}: ${byDay.get(d)!.map(summarizeWorkItem).join(', ')}`)
    .join(' | ');
}
