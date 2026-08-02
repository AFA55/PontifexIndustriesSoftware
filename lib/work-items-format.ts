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

/** One work item as a readable summary fragment: label ×qty + detail + note. */
export function summarizeWorkItem(item: WorkItemLike): string {
  const label = item.work_type || 'Work';
  const qty = n(item.quantity) || 1;
  let s = `${label} ×${qty}`;
  const detail = workItemDetailLine(item);
  if (detail) s += ` (${detail})`;
  if (item.notes) s += ` — ${truncate(String(item.notes), 80)}`;
  return s;
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
