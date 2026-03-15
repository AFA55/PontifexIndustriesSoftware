/**
 * Equipment Unifier
 *
 * Flattens per-service-type equipment selections into a single deduplicated list
 * grouped by truck-loading categories.  Used by the operator's Unified Equipment
 * Confirmation Panel so every item appears exactly once — with quantities summed
 * across services, service-context tags, and logical category grouping.
 *
 * Handles two data paths:
 *   1. New-style jobs (schedule form): reads `equipment_selections` JSONB
 *   2. Old-style jobs (quick add):     falls back to `equipment_needed` string[]
 */

import { getDisplayName } from '@/lib/equipment-map';

// ── Types ────────────────────────────────────────────────────

export type EquipmentCategory =
  | 'machines_power'
  | 'core_bits'
  | 'cutting_accessories'
  | 'hoses_cords'
  | 'drums_containment'
  | 'supplies';

export interface UnifiedEquipmentItem {
  id: string;                // Stable key for checkedItems state
  label: string;             // Display name
  category: EquipmentCategory;
  quantity: number | null;   // null = toggle, number = summed
  unit: string | null;       // "ft" | null  — core bits show as "x{N}"
  sourceServices: string[];  // Which service types need this
  optionValue: string | null; // e.g. "20 inch" for chain_saw option
  isMandatory: boolean;      // Only relevant in fallback mode
}

// ── Category Order (matches how an operator loads a truck) ───

export const CATEGORY_ORDER: EquipmentCategory[] = [
  'machines_power',
  'core_bits',
  'cutting_accessories',
  'hoses_cords',
  'drums_containment',
  'supplies',
];

export const CATEGORY_META: Record<EquipmentCategory, { label: string; color: string }> = {
  machines_power:      { label: 'Machines & Power',    color: 'blue'   },
  core_bits:           { label: 'Core Bits',           color: 'rose'   },
  cutting_accessories: { label: 'Cutting Accessories', color: 'orange' },
  hoses_cords:         { label: 'Hoses & Cords',      color: 'cyan'   },
  drums_containment:   { label: 'Drums & Containment', color: 'amber'  },
  supplies:            { label: 'Supplies',            color: 'slate'  },
};

// ── Service display labels (compact) ─────────────────────────

export const SERVICE_TAG_LABELS: Record<string, string> = {
  'ECD': 'ECD',
  'HFCD': 'HFCD',
  'HCD': 'HCD',
  'DFS': 'DFS',
  'WS/TS': 'WS/TS',
  'CS': 'CS',
  'HHS/PS': 'HHS',
  'WireSaw': 'Wire',
  'GPR': 'GPR',
  'Demo': 'Demo',
  'Brokk': 'Brokk',
};

// ── Item → Category Classification ──────────────────────────

const ITEM_CATEGORY: Record<string, EquipmentCategory> = {
  // Machines & Power
  ecd_machine: 'machines_power',
  hfcd_machine: 'machines_power',
  dpp: 'machines_power',
  generator: 'machines_power',
  hcd_stand: 'machines_power',
  backup_saw: 'machines_power',
  backup_track_saw: 'machines_power',
  '63_backup': 'machines_power',

  // Cutting Accessories
  '32_guard': 'cutting_accessories',
  '42_guard': 'cutting_accessories',
  guards_pbg: 'cutting_accessories',
  track_pent: 'cutting_accessories',
  track_pbg: 'cutting_accessories',
  boots_pent: 'cutting_accessories',
  boots_pbg: 'cutting_accessories',
  '15_bar_chain': 'cutting_accessories',
  '20_bar_chain': 'cutting_accessories',

  // Hoses & Cords
  hydraulic_hose: 'hoses_cords',
  '480_cord': 'hoses_cords',

  // Drums & Containment
  slurry_drums: 'drums_containment',
  slurry_drums_pbg: 'drums_containment',
  pump_can: 'drums_containment',
  slurry_ring: 'drums_containment',

  // Supplies
  chalk_line: 'supplies',
  clear_spray: 'supplies',
  plastic: 'supplies',
  duct_tape: 'supplies',
  apron: 'supplies',
  spray_paint: 'supplies',
  extra_vacuum_head: 'supplies',
};

function getCategory(itemId: string): EquipmentCategory {
  if (itemId.startsWith('core_bit_')) return 'core_bits';
  if (itemId.startsWith('chain_saw')) return 'cutting_accessories';
  return ITEM_CATEGORY[itemId] || 'supplies';
}

// ── Item → Label ────────────────────────────────────────────

const ITEM_LABELS: Record<string, string> = {
  ecd_machine: 'Electric Core Drill',
  hfcd_machine: 'HF Core Drill',
  pump_can: 'Pump Can',
  slurry_ring: 'Slurry Ring',
  hydraulic_hose: 'Hydraulic Hose',
  dpp: 'Diesel Power Pack',
  hcd_stand: 'HCD Stand',
  slurry_drums: 'Slurry Drums',
  slurry_drums_pbg: 'Slurry Drums',
  extra_vacuum_head: 'Extra Vacuum Head',
  backup_saw: 'Backup Saw',
  chalk_line: 'Chalk Line',
  clear_spray: 'Clear Spray',
  '480_cord': '480 Cord',
  '32_guard': '32" Guard',
  '42_guard': '42" Guard',
  '63_backup': '63 Backup System',
  track_pent: 'Track (Pentruder)',
  boots_pent: 'Boots (Pentruder)',
  generator: 'Generator',
  backup_track_saw: 'Backup Track Saw',
  track_pbg: 'Track (PBG)',
  guards_pbg: 'Guards (PBG)',
  boots_pbg: 'Boots (PBG)',
  plastic: 'Plastic',
  duct_tape: 'Duct Tape',
  apron: 'Apron',
  spray_paint: 'Spray Paint',
  '15_bar_chain': '15" Bar & Chain',
  '20_bar_chain': '20" Bar & Chain',
};

function getLabel(itemId: string): string {
  if (itemId.startsWith('core_bit_')) {
    const size = itemId.replace('core_bit_', '');
    return `${size}" Core Bit`;
  }
  if (itemId.startsWith('chain_saw_')) {
    const size = itemId.replace('chain_saw_', '');
    return `Chain Saw (${size}")`;
  }
  return ITEM_LABELS[itemId] || itemId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Unit Inference ──────────────────────────────────────────

const UNIT_MAP: Record<string, string> = {
  hydraulic_hose: 'ft',
  '480_cord': 'ft',
  track_pent: 'ft',
  track_pbg: 'ft',
};

function getUnit(itemId: string): string | null {
  return UNIT_MAP[itemId] || null;
}

// ── Alias Map (canonical dedup key) ─────────────────────────

const DEDUP_ALIASES: Record<string, string> = {
  slurry_drums_pbg: 'slurry_drums',
};

function getCanonicalKey(itemId: string): string {
  return DEDUP_ALIASES[itemId] || itemId;
}

// ── Chain Saw / Bar & Chain Merger ──────────────────────────

/**
 * Extracts numeric size from chain_saw option values like "20 inch", "20'", "15'"
 */
function extractChainSawSize(value: string): number | null {
  const match = value.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

// ── Main Unify Function ─────────────────────────────────────

export function unifyEquipmentSelections(
  equipmentSelections: Record<string, Record<string, string>> | null | undefined,
  equipmentNeeded: string[] | null | undefined,
  mandatoryEquipment: string[] | null | undefined,
): UnifiedEquipmentItem[] {
  // Primary path: equipment_selections has data
  if (equipmentSelections && typeof equipmentSelections === 'object') {
    const entries = Object.entries(equipmentSelections).filter(
      ([, items]) => items && typeof items === 'object' && Object.keys(items).length > 0
    );
    if (entries.length > 0) {
      return mergeFromSelections(equipmentSelections);
    }
  }

  // Fallback path: old jobs with equipment_needed array
  if (equipmentNeeded && equipmentNeeded.length > 0) {
    return fallbackFromNeeded(equipmentNeeded, mandatoryEquipment || []);
  }

  return [];
}

// ── Primary Path: Merge from equipment_selections JSONB ─────

function mergeFromSelections(
  selections: Record<string, Record<string, string>>,
): UnifiedEquipmentItem[] {
  const accumulator = new Map<string, UnifiedEquipmentItem>();

  // First pass: collect all chain_saw selections to know which bar_chain items to merge
  const chainSawSizes = new Set<number>();
  for (const [, items] of Object.entries(selections)) {
    if (items.chain_saw) {
      const size = extractChainSawSize(items.chain_saw);
      if (size) chainSawSizes.add(size);
    }
  }

  for (const [serviceCode, items] of Object.entries(selections)) {
    if (!items || typeof items !== 'object') continue;

    for (const [itemId, value] of Object.entries(items)) {
      // Skip metadata keys
      if (itemId === '_sub') continue;
      // Skip empty values
      if (!value || value.trim() === '') continue;

      // Determine canonical key
      let canonicalId = getCanonicalKey(itemId);
      let label: string;
      let optionValue: string | null = null;

      // ── Chain Saw / Bar & Chain deduplication ──
      if (itemId === 'chain_saw') {
        const size = extractChainSawSize(value);
        if (size) {
          canonicalId = `chain_saw_${size}`;
          optionValue = value;
        }
        label = getLabel(canonicalId);
      } else if (itemId === '15_bar_chain' && chainSawSizes.has(15)) {
        // This bar & chain will be merged with chain_saw_15
        canonicalId = 'chain_saw_15';
        label = getLabel(canonicalId);
      } else if (itemId === '20_bar_chain' && chainSawSizes.has(20)) {
        // This bar & chain will be merged with chain_saw_20
        canonicalId = 'chain_saw_20';
        label = getLabel(canonicalId);
      } else {
        label = getLabel(canonicalId);
      }

      // Parse quantity
      // chain_saw values like "20 inch" or "15'" are SIZE selectors, NOT quantities
      const isToggle = value === 'yes' || itemId === 'chain_saw';
      const numericValue = !isToggle ? parseFloat(value) : NaN;
      const hasQuantity = !isNaN(numericValue) && numericValue > 0;

      // Check if item already exists in accumulator
      const existing = accumulator.get(canonicalId);

      if (existing) {
        // Merge: add service tag
        if (!existing.sourceServices.includes(serviceCode)) {
          existing.sourceServices.push(serviceCode);
        }
        // Sum quantities for numeric items
        if (hasQuantity && existing.quantity !== null) {
          existing.quantity += numericValue;
        } else if (hasQuantity && existing.quantity === null) {
          existing.quantity = numericValue;
        }
        // Keep first optionValue found
        if (optionValue && !existing.optionValue) {
          existing.optionValue = optionValue;
        }
      } else {
        // New item
        accumulator.set(canonicalId, {
          id: canonicalId,
          label,
          category: getCategory(canonicalId),
          quantity: hasQuantity ? numericValue : null,
          unit: hasQuantity ? getUnit(canonicalId) : null,
          sourceServices: [serviceCode],
          optionValue,
          isMandatory: true, // All items from schedule form are mandatory
        });
      }
    }
  }

  // Convert to sorted array
  const items = Array.from(accumulator.values());
  return sortItems(items);
}

// ── Fallback Path: From equipment_needed string[] ───────────

function fallbackFromNeeded(
  equipmentNeeded: string[],
  mandatoryEquipment: string[],
): UnifiedEquipmentItem[] {
  const mandatorySet = new Set(mandatoryEquipment.map(m => m.toUpperCase()));

  return equipmentNeeded.map(item => ({
    id: item,
    label: getDisplayName(item),
    category: 'machines_power' as EquipmentCategory,
    quantity: null,
    unit: null,
    sourceServices: [],
    optionValue: null,
    isMandatory: mandatorySet.has(item.toUpperCase()),
  }));
}

// ── Sorting ─────────────────────────────────────────────────

function sortItems(items: UnifiedEquipmentItem[]): UnifiedEquipmentItem[] {
  const categoryIndex = Object.fromEntries(
    CATEGORY_ORDER.map((cat, idx) => [cat, idx])
  );

  return items.sort((a, b) => {
    // Sort by category order
    const catDiff = (categoryIndex[a.category] ?? 99) - (categoryIndex[b.category] ?? 99);
    if (catDiff !== 0) return catDiff;

    // Within core_bits: sort by size ascending
    if (a.category === 'core_bits' && b.category === 'core_bits') {
      const sizeA = parseFloat(a.id.replace('core_bit_', '')) || 0;
      const sizeB = parseFloat(b.id.replace('core_bit_', '')) || 0;
      return sizeA - sizeB;
    }

    // Otherwise alphabetical by label
    return a.label.localeCompare(b.label);
  });
}

// ── Helpers for the UI ──────────────────────────────────────

/** Group unified items by category (preserving order) */
export function groupByCategory(
  items: UnifiedEquipmentItem[],
): { category: EquipmentCategory; items: UnifiedEquipmentItem[] }[] {
  const groups = new Map<EquipmentCategory, UnifiedEquipmentItem[]>();

  for (const item of items) {
    const existing = groups.get(item.category);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(item.category, [item]);
    }
  }

  // Return in CATEGORY_ORDER
  return CATEGORY_ORDER
    .filter(cat => groups.has(cat))
    .map(cat => ({ category: cat, items: groups.get(cat)! }));
}

/** Check if ALL unified items are confirmed */
export function allItemsConfirmed(
  items: UnifiedEquipmentItem[],
  checkedItems: Record<string, boolean>,
): boolean {
  if (items.length === 0) return true;
  return items.every(item => checkedItems[item.id]);
}

/** Check if all MANDATORY items are confirmed (for fallback mode) */
export function mandatoryItemsConfirmed(
  items: UnifiedEquipmentItem[],
  checkedItems: Record<string, boolean>,
): boolean {
  const mandatory = items.filter(i => i.isMandatory);
  if (mandatory.length === 0) return true;
  return mandatory.every(item => checkedItems[item.id]);
}
