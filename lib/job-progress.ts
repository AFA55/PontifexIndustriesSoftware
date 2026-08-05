/**
 * Reconciles what OPERATORS logged against what the OFFICE scoped.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * "Job Scope & Progress" read 0% on every job in production while operators
 * had logged real work. Two stacked faults:
 *
 *   1. NOTHING EVER WROTE THE PROGRESS TABLE. The office panel read
 *      `job_progress_entries`, and the only route that writes that table
 *      (POST /api/jobs/[id]/progress) is not called from anywhere in the
 *      codebase. Prod had 14 work_items across 9 jobs and 1 progress entry.
 *      The bar was structurally incapable of moving.
 *
 *   2. THE TWO SIDES SPEAK DIFFERENT LANGUAGES. The office scopes work as
 *      "Wall/Track Sawing" / "Electric Core Drilling"; the operator ticket
 *      records "WALL SAW" / "ELECTRIC CORE DRILL". A third vocabulary
 *      (`wall_sawing`, `core_drilling`) comes from the manual Job Scope panel.
 *      Even a working write path would have matched nothing.
 *
 * So progress is DERIVED from `work_items` — the operator's actual record and
 * the single source of truth — rather than mirrored into a parallel table that
 * can drift. Deriving also means every job already in the database lights up
 * with no backfill.
 *
 * ── What it deliberately will not do ─────────────────────────────────────────
 * A scope item measured in `percent` has no quantity an operator can report
 * against (the office set a target of "100%"). We do NOT invent a number for
 * those — they report `derivable: false` so the UI can say "worked, N entries"
 * instead of showing a fabricated percentage.
 */

// ─── Work families ───────────────────────────────────────────────────────────
// The shared middle ground between the three vocabularies. Two labels belong to
// the same family when they describe the same physical work.

export type WorkFamily =
  | 'core_drilling'
  | 'wall_sawing'
  | 'flat_sawing'
  | 'hand_sawing'
  | 'chain_sawing'
  | 'wire_sawing'
  | 'gpr'
  | 'demo'
  | 'brokk'
  | 'concrete_work'
  | 'other';

/** Office service codes (schedule form) → family. Codes are opaque, so explicit. */
const SERVICE_CODE_FAMILY: Record<string, WorkFamily> = {
  ECD: 'core_drilling',
  HFCD: 'core_drilling',
  HCD: 'core_drilling',
  DFS: 'flat_sawing',
  EFS: 'flat_sawing',
  'WS/TS': 'wall_sawing',
  CS: 'chain_sawing',
  'HHS/PS': 'hand_sawing',
  WireSaw: 'wire_sawing',
  GPR: 'gpr',
  Demo: 'demo',
  Brokk: 'brokk',
  Other: 'other',
};

/**
 * Reduce any label to comparable tokens.
 * Punctuation becomes space ("Wall/Track Sawing" → "WALL TRACK SAWING") and
 * gerunds collapse ("SAWING" → "SAW") so the office's "-ing" phrasing and the
 * operator's imperative phrasing meet in the middle.
 */
function tokenize(raw: string): string[] {
  return (raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((t) =>
      t
        .replace(/^SAWING$|^SAWS$/, 'SAW')
        .replace(/^DRILLING$|^DRILLS$/, 'DRILL')
        .replace(/^CORES$/, 'CORE')
        .replace(/^HOLES$/, 'HOLE')
    );
}

/**
 * Classify any work label — operator work item, office service label, office
 * service code, or Job Scope panel work_type — into a family.
 */
export function workFamily(raw: string): WorkFamily {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'other';

  // Service codes are opaque strings; check them before tokenizing.
  const byCode = SERVICE_CODE_FAMILY[trimmed];
  if (byCode) return byCode;

  const t = tokenize(trimmed);
  const has = (w: string) => t.includes(w);
  const saw = has('SAW');

  // CORE is unambiguous and must precede the saw checks — "SPOT/CAUGHT CORES"
  // and "ELECTRIC CORE DRILL" are core work, not sawing. Note "HAND DRILL" has
  // no CORE token and correctly falls through.
  if (has('CORE')) return 'core_drilling';

  if (has('WIRE') && saw) return 'wire_sawing';
  if (has('CHAIN') && saw) return 'chain_sawing';
  if ((has('WALL') || has('TRACK')) && saw) return 'wall_sawing';
  if ((has('HAND') || has('HANDHELD') || has('PUSH') || has('RING') || has('FLUSH')) && saw) {
    return 'hand_sawing';
  }
  if ((has('SLAB') || has('FLOOR') || has('FLAT') || has('DIESEL') || has('ELECTRIC')) && saw) {
    return 'flat_sawing';
  }

  if (has('GPR') || has('SCAN')) return 'gpr';
  if (has('BROKK')) return 'brokk';
  if (has('DEMO') || has('DEMOLITION') || has('BREAK') || has('REMOVE') || has('REMOVAL') || has('EXCAVATE')) {
    return 'demo';
  }
  if (has('GRINDING') || has('CHIPPING') || has('REPAIR') || has('CONCRETE')) return 'concrete_work';

  // A bare "SAW" we couldn't place is still sawing — flat is the common case.
  if (saw) return 'flat_sawing';

  return 'other';
}

// ─── Quantities ──────────────────────────────────────────────────────────────

export type ScopeUnit = 'linear_ft' | 'sq_ft' | 'holes' | 'percent' | 'items' | 'each' | 'hours';

/** Units we can compute a real completed number for. `percent` we cannot. */
export function isDerivableUnit(unit: string): boolean {
  return unit !== 'percent';
}

export interface WorkItemLike {
  work_type: string;
  quantity?: number | string | null;
  linear_feet_cut?: number | string | null;
  core_quantity?: number | string | null;
  [key: string]: unknown;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * How much did this work item accomplish, expressed in the scope item's unit?
 *
 * Returns null when the item carries nothing measurable in that unit — that is
 * a real answer ("this entry doesn't move this target"), not a zero.
 */
export function quantityInUnit(item: WorkItemLike, unit: string): number | null {
  const family = workFamily(item.work_type);
  const quantity = num(item.quantity);

  switch (unit) {
    case 'linear_ft':
      // Prefer the dedicated measurement; older rows only carry `quantity`.
      return num(item.linear_feet_cut) ?? (family !== 'core_drilling' ? quantity : null);

    case 'holes':
      return num(item.core_quantity) ?? (family === 'core_drilling' ? quantity : null);

    case 'sq_ft':
    case 'items':
    case 'each':
    case 'hours':
      return quantity;

    case 'percent':
      // The office set a 100% target with no unit an operator reports against.
      // Inventing a percentage here would be fabricating a number.
      return null;

    default:
      return quantity;
  }
}

// ─── Matching ────────────────────────────────────────────────────────────────

export interface ScopeItemLike {
  id: string;
  work_type: string;
  description?: string | null;
  unit: string;
  target_quantity?: number | string | null;
  sort_order?: number | null;
}

/**
 * Which scope item does this work item count toward?
 *
 * Same family is the requirement. Where a job scopes more than one item in the
 * same family (e.g. Electric AND Hydraulic Core Drilling) we disambiguate on
 * the sub-type word the operator's own label carries; a generic "CORE DRILL"
 * against two core scope items is genuinely ambiguous, so we take the first by
 * sort order and say so rather than silently guessing.
 */
export function matchWorkItemToScope(
  item: WorkItemLike,
  scopeItems: ScopeItemLike[]
): { scopeItem: ScopeItemLike | null; ambiguous: boolean } {
  const family = workFamily(item.work_type);
  const candidates = scopeItems.filter((s) => workFamily(s.work_type) === family);

  if (candidates.length === 0) return { scopeItem: null, ambiguous: false };
  if (candidates.length === 1) return { scopeItem: candidates[0], ambiguous: false };

  // More than one target in this family — try to disambiguate on qualifiers the
  // operator actually typed (ELECTRIC / HYDRAULIC / DIESEL / HIGH FREQUENCY).
  const itemTokens = new Set(tokenize(item.work_type));
  const QUALIFIERS = ['ELECTRIC', 'HYDRAULIC', 'DIESEL', 'HIGH', 'FREQUENCY', 'SLAB', 'TRACK', 'WALL'];
  const qualifiers = QUALIFIERS.filter((q) => itemTokens.has(q));

  if (qualifiers.length > 0) {
    const qualified = candidates.filter((s) => {
      const scopeTokens = new Set(tokenize(`${s.work_type} ${s.description ?? ''}`));
      return qualifiers.some((q) => scopeTokens.has(q));
    });
    if (qualified.length === 1) return { scopeItem: qualified[0], ambiguous: false };
    if (qualified.length > 1) {
      return { scopeItem: sortedFirst(qualified), ambiguous: true };
    }
  }

  return { scopeItem: sortedFirst(candidates), ambiguous: true };
}

function sortedFirst(items: ScopeItemLike[]): ScopeItemLike {
  return [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
}

// ─── Rollup ──────────────────────────────────────────────────────────────────

export interface ScopeProgressRow {
  scope_item_id: string;
  description: string | null;
  work_type: string;
  unit: string;
  target_quantity: number;
  completed_quantity: number;
  /** null when the unit can't be derived — the UI must not render this as 0%. */
  pct_complete: number | null;
  /** True when a real number is computable. False for `percent`-unit items. */
  derivable: boolean;
  /** How many operator entries counted toward this item. */
  entry_count: number;
  /** True if any entry could have belonged to a sibling target in the same family. */
  ambiguous: boolean;
}

export interface UnmatchedWorkRow {
  work_type: string;
  quantity: number | null;
  /** Why it didn't count — so the office can fix the scope instead of guessing. */
  reason: 'no_scope_item_for_this_work' | 'no_measurable_quantity';
}

export interface JobProgressResult {
  scope_progress: ScopeProgressRow[];
  /** Work the operators logged that no scope item accounts for. */
  unmatched_work: UnmatchedWorkRow[];
  /** Overall completion across derivable targets, or null if none are derivable. */
  overall_pct: number | null;
}

/**
 * Roll operator work items up against the office's scope items.
 * Pure — no I/O — so it is equally usable from any API route and unit-testable.
 */
export function computeJobProgress(
  scopeItems: ScopeItemLike[],
  workItems: WorkItemLike[]
): JobProgressResult {
  const rows = new Map<string, ScopeProgressRow>();
  for (const s of scopeItems) {
    rows.set(s.id, {
      scope_item_id: s.id,
      description: s.description ?? null,
      work_type: s.work_type,
      unit: s.unit,
      target_quantity: num(s.target_quantity) ?? 0,
      completed_quantity: 0,
      pct_complete: isDerivableUnit(s.unit) ? 0 : null,
      derivable: isDerivableUnit(s.unit),
      entry_count: 0,
      ambiguous: false,
    });
  }

  const unmatched: UnmatchedWorkRow[] = [];

  for (const item of workItems) {
    const { scopeItem, ambiguous } = matchWorkItemToScope(item, scopeItems);
    if (!scopeItem) {
      unmatched.push({
        work_type: item.work_type,
        quantity: num(item.quantity),
        reason: 'no_scope_item_for_this_work',
      });
      continue;
    }

    const row = rows.get(scopeItem.id);
    if (!row) continue;

    // An entry against a percent-unit target still counts as activity even
    // though we can't put a number on it.
    row.entry_count += 1;
    if (ambiguous) row.ambiguous = true;

    const qty = quantityInUnit(item, scopeItem.unit);
    if (qty === null) {
      if (row.derivable) {
        unmatched.push({
          work_type: item.work_type,
          quantity: num(item.quantity),
          reason: 'no_measurable_quantity',
        });
      }
      continue;
    }
    row.completed_quantity += qty;
  }

  for (const row of rows.values()) {
    if (!row.derivable) continue;
    row.pct_complete =
      row.target_quantity > 0
        ? parseFloat(Math.min(100, (row.completed_quantity / row.target_quantity) * 100).toFixed(1))
        : 0;
  }

  const scope_progress = Array.from(rows.values());

  // Overall = total completed vs total targeted across derivable items only.
  const derivableRows = scope_progress.filter((r) => r.derivable && r.target_quantity > 0);
  const overall_pct = derivableRows.length
    ? parseFloat(
        Math.min(
          100,
          (derivableRows.reduce((s, r) => s + r.completed_quantity, 0) /
            derivableRows.reduce((s, r) => s + r.target_quantity, 0)) *
            100
        ).toFixed(1)
      )
    : null;

  return { scope_progress, unmatched_work: unmatched, overall_pct };
}
