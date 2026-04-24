/**
 * Canonical taxonomy for per-scope skill proficiency + equipment proficiency.
 *
 * Single source of truth for:
 *  - Allowed keys when reading/writing `profiles.skill_levels` (jsonb)
 *  - Friendly labels shown in admin UI
 *  - Mapping from job_orders.job_type service codes → skill scope keys
 *    (used by the schedule-board skill-match recommendation engine)
 *
 * Value ranges:
 *  - Scope keys: integer 0–10 (0 = not trained)
 *  - Equipment keys: integer 0–5 (0 = not qualified)
 */

export const SCOPE_KEYS = [
  'core_drill',
  'slab_saw',
  'wall_saw',
  'push_saw',
  'chain_saw',
  'hand_saw',
  'removal',
  'demo',
] as const;

export const EQUIPMENT_KEYS = [
  'mini_ex',
  'skid_steer',
  'lull',
  'forklift',
] as const;

export type ScopeKey = (typeof SCOPE_KEYS)[number];
export type EquipmentKey = (typeof EQUIPMENT_KEYS)[number];

export const SCOPE_MAX = 10;
export const EQUIPMENT_MAX = 5;

export const SCOPE_LABELS: Record<string, string> = {
  core_drill: 'Core Drilling',
  slab_saw: 'Slab Saw',
  wall_saw: 'Wall Saw',
  push_saw: 'Push Saw',
  chain_saw: 'Chain Saw',
  hand_saw: 'Hand Saw',
  removal: 'Removal',
  demo: 'Demo',
};

export const EQUIPMENT_LABELS: Record<string, string> = {
  mini_ex: 'Mini Excavator',
  skid_steer: 'Skid Steer',
  lull: 'Lull / Telehandler',
  forklift: 'Forklift',
};

/**
 * Map job_orders.job_type service code (case-insensitive, trimmed) → scope key.
 * null means "no specific scope" — skill-match should fall back to generic
 * skill_level_numeric for those operators.
 *
 * Code legend (Patriot service codes):
 *  ECD  — Electric Core Drill
 *  HFCD — Hand-Feed Core Drill
 *  HCD  — Hydraulic Core Drill
 *  DFS  — Diesel Flat Saw
 *  EFS  — Electric Flat Saw
 *  WS   — Wall Saw
 *  TS   — Track Saw (wall-saw class)
 *  CS   — Chain Saw
 *  HHS  — Hand-Held Saw (push-saw class, cross-listed to hand_saw)
 *  PS   — Push Saw
 *  Demo / Brokk — Demolition
 */
export const SERVICE_CODE_TO_SCOPE: Record<string, ScopeKey | null> = {
  ecd: 'core_drill',
  hfcd: 'core_drill',
  hcd: 'core_drill',
  dfs: 'slab_saw',
  efs: 'slab_saw',
  ws: 'wall_saw',
  ts: 'wall_saw',
  cs: 'chain_saw',
  hhs: 'push_saw',
  ps: 'push_saw',
  demo: 'demo',
  brokk: 'demo',
};

/**
 * Secondary scope mapping — a service code may also qualify a secondary scope
 * (e.g. HHS primarily push_saw, also counts as hand_saw). Used when checking
 * "is operator qualified for any scope the job requires".
 */
export const SERVICE_CODE_SECONDARY_SCOPE: Record<string, ScopeKey | null> = {
  hhs: 'hand_saw',
};

/** Resolve a service code string to its primary scope (or null). */
export function resolveScopeForServiceCode(code: string): ScopeKey | null {
  const k = (code || '').trim().toLowerCase();
  if (!k) return null;
  return SERVICE_CODE_TO_SCOPE[k] ?? null;
}

/** All scopes (primary + secondary) a service code maps to. */
export function resolveAllScopesForServiceCode(code: string): ScopeKey[] {
  const k = (code || '').trim().toLowerCase();
  if (!k) return [];
  const out: ScopeKey[] = [];
  const primary = SERVICE_CODE_TO_SCOPE[k];
  if (primary) out.push(primary);
  const secondary = SERVICE_CODE_SECONDARY_SCOPE[k];
  if (secondary) out.push(secondary);
  return out;
}

/** Check if a key is a valid scope key. */
export function isScopeKey(k: string): k is ScopeKey {
  return (SCOPE_KEYS as readonly string[]).includes(k);
}

/** Check if a key is a valid equipment key. */
export function isEquipmentKey(k: string): k is EquipmentKey {
  return (EQUIPMENT_KEYS as readonly string[]).includes(k);
}
