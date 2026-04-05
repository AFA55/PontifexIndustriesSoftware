/**
 * Equipment Abbreviation Map
 *
 * SINGLE SOURCE OF TRUTH for equipment abbreviation ↔ full name mapping.
 * Used by admin forms (schedule-form, EditJobPanel, QuickAddJobPanel)
 * and operator views (EquipmentPanel, JobTicketDetail, my-jobs/[id]).
 *
 * NOTE: This is NOT the same as types/equipment-constants.ts, which defines
 * granular equipment items per job type (bit sizes, blade sizes, specific
 * drill models). This file maps the high-level equipment category abbreviations
 * used in the equipment_needed and mandatory_equipment fields on job_orders.
 */

export interface EquipmentPreset {
  abbrev: string;
  full: string;
  gradient: string;
}

/**
 * Canonical list of equipment presets with abbreviations.
 * Admin forms render these as selectable buttons.
 * The abbreviation is what typically gets stored in the database.
 */
export const EQUIPMENT_PRESETS: EquipmentPreset[] = [
  { abbrev: 'HHS/PS', full: 'Hydraulic Hand Saw / Push Saw', gradient: 'from-emerald-500 to-teal-600' },
  { abbrev: 'DPP',    full: 'Diesel Power Pack',              gradient: 'from-blue-500 to-indigo-600' },
  { abbrev: 'TS',     full: 'Track Saw',                      gradient: 'from-orange-500 to-red-500' },
  { abbrev: 'WS',     full: 'Wall Saw',                       gradient: 'from-violet-500 to-purple-600' },
  { abbrev: 'GPP',    full: 'Gas Power Pack',                 gradient: 'from-amber-500 to-orange-600' },
  { abbrev: 'DFS',    full: 'Diesel Floor Saw',               gradient: 'from-cyan-500 to-blue-600' },
  { abbrev: 'EFS',    full: 'Electric Floor Saw',            gradient: 'from-green-500 to-emerald-600' },
  { abbrev: 'ECD',    full: 'Electric Core Drill',            gradient: 'from-rose-500 to-pink-600' },
  { abbrev: 'HCD',    full: 'Hydraulic Core Drill',           gradient: 'from-red-500 to-rose-600' },
  { abbrev: 'CS',     full: 'Chain Saw',                      gradient: 'from-amber-500 to-yellow-600' },
  { abbrev: 'GPR',    full: 'GPR Scanner',                    gradient: 'from-rose-500 to-pink-600' },
  { abbrev: 'HWS',    full: 'Hydraulic Wire Saw',             gradient: 'from-teal-500 to-cyan-600' },
  { abbrev: 'BRK',    full: 'Brokk',                          gradient: 'from-stone-500 to-stone-700' },
];

// ── Lookup Maps (built once, O(1) lookups) ──────────────────

/** Map from abbreviation (uppercased) → full name */
const abbrevToFull = new Map<string, string>(
  EQUIPMENT_PRESETS.map(p => [p.abbrev.toUpperCase(), p.full])
);

/** Map from full name (lowercased) → abbreviation */
const fullToAbbrev = new Map<string, string>(
  EQUIPMENT_PRESETS.map(p => [p.full.toLowerCase(), p.abbrev])
);

/**
 * Legacy abbreviation aliases for backward compatibility.
 * Maps old abbreviations (that may exist in the database) to current canonical abbreviations.
 */
const LEGACY_ALIASES: Record<string, string> = {
  'HHS': 'HHS/PS',                      // HHS renamed to HHS/PS
  'HYDRAULIC HAND SAW': 'HHS/PS',       // Old full name → new abbrev
  'CS-14': 'CS-14',                     // Deprecated: Concrete Saw 14" (still resolve for old data)
  'CONCRETE SAW 14"': 'CS-14',          // Deprecated: legacy full name
};

// ── Public Utilities ────────────────────────────────────────

/**
 * Abbreviation-only list for quick-add suggestions in EditJobPanel.
 */
export const EQUIPMENT_ABBREVIATIONS: string[] = EQUIPMENT_PRESETS.map(p => p.abbrev);

/**
 * Normalize an equipment string to its canonical abbreviation (uppercase).
 * Accepts either an abbreviation or a full name.
 * If unrecognized (custom equipment), returns the input uppercased.
 *
 * Examples:
 *   normalizeToAbbrev("WS")           → "WS"
 *   normalizeToAbbrev("Wall Saw")     → "WS"
 *   normalizeToAbbrev("Scissor Lift") → "SCISSOR LIFT"
 */
export function normalizeToAbbrev(input: string): string {
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();

  // Check legacy aliases first (e.g. old "HHS" → "HHS/PS")
  const legacy = LEGACY_ALIASES[upper];
  if (legacy) return legacy.toUpperCase();

  // Already a known abbreviation?
  if (abbrevToFull.has(upper)) return upper;

  // Is it a known full name?
  const abbrev = fullToAbbrev.get(trimmed.toLowerCase());
  if (abbrev) return abbrev.toUpperCase();

  // Unknown / custom equipment — uppercase for consistent keying
  return upper;
}

/**
 * Get the display name for an equipment string.
 * Returns the human-readable full name if known, otherwise the input as-is.
 *
 * Examples:
 *   getDisplayName("WS")           → "Wall Saw"
 *   getDisplayName("Wall Saw")     → "Wall Saw"
 *   getDisplayName("Scissor Lift") → "Scissor Lift"
 */
export function getDisplayName(input: string): string {
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();

  // Check legacy aliases first (e.g. old "HHS" → resolve via new abbrev)
  const legacy = LEGACY_ALIASES[upper];
  if (legacy) {
    const full = abbrevToFull.get(legacy.toUpperCase());
    if (full) return full;
  }

  // Is it an abbreviation? Return full name.
  const full = abbrevToFull.get(upper);
  if (full) return full;

  // Already a full name or custom item — return as-is
  return trimmed;
}

/**
 * Check whether two equipment strings refer to the same equipment,
 * regardless of whether one is an abbreviation and the other a full name.
 */
export function equipmentMatches(a: string, b: string): boolean {
  return normalizeToAbbrev(a) === normalizeToAbbrev(b);
}

/**
 * Given a mandatory_equipment array and a checkedItems record
 * (keyed by equipment_needed strings), determine if all mandatory
 * items have been checked. Handles abbreviation/full-name mismatches.
 */
export function isMandatoryComplete(
  mandatoryEquipment: string[],
  checkedItems: Record<string, boolean>,
): boolean {
  if (!mandatoryEquipment || mandatoryEquipment.length === 0) return true;

  // Build a set of normalized keys for all CHECKED items
  const checkedNormalized = new Set<string>();
  for (const [key, checked] of Object.entries(checkedItems)) {
    if (checked) {
      checkedNormalized.add(normalizeToAbbrev(key));
    }
  }

  // Every mandatory item (normalized) must be in the checked set
  return mandatoryEquipment.every(item =>
    checkedNormalized.has(normalizeToAbbrev(item))
  );
}

/**
 * Check if a specific equipment item (from equipment_needed list)
 * is in the mandatory set, handling abbreviation/full-name mismatches.
 */
export function isItemMandatory(
  item: string,
  mandatoryEquipment: string[],
): boolean {
  if (!mandatoryEquipment || mandatoryEquipment.length === 0) return false;
  const normalizedItem = normalizeToAbbrev(item);
  return mandatoryEquipment.some(m => normalizeToAbbrev(m) === normalizedItem);
}

/**
 * Count how many mandatory items have been checked,
 * handling abbreviation/full-name mismatches.
 */
export function countCheckedMandatory(
  mandatoryEquipment: string[],
  checkedItems: Record<string, boolean>,
): number {
  if (!mandatoryEquipment || mandatoryEquipment.length === 0) return 0;

  const checkedNormalized = new Set<string>();
  for (const [key, checked] of Object.entries(checkedItems)) {
    if (checked) {
      checkedNormalized.add(normalizeToAbbrev(key));
    }
  }

  return mandatoryEquipment.filter(item =>
    checkedNormalized.has(normalizeToAbbrev(item))
  ).length;
}
