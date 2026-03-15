/**
 * Equipment Recommendations Engine
 *
 * Rule-based recommendations per scope type, with input controls for quantities.
 * Each scope triggers a set of recommended equipment items with specific input types.
 */

// ── Input types for recommended equipment ─────────────────────
export type RecommendedItemInputType =
  | 'checkbox'       // simple on/off
  | 'quantity'        // number input (qty)
  | 'quantity_ft'     // number input (feet)
  | 'single_select'   // pick one option
  | 'multi_select'    // pick multiple options
  | 'auto_suggest';   // auto-suggest from scope data

export interface RecommendedItem {
  key: string;              // unique key for this item
  label: string;            // display name
  inputType: RecommendedItemInputType;
  defaultSelected?: boolean; // pre-checked by default
  placeholder?: string;
  suffix?: string;          // unit label (ft, qty, etc.)
  options?: string[];       // for single_select / multi_select
  autoSuggestField?: string; // scope_details field to derive suggestions from
}

export interface ScopeRecommendation {
  scopeCode: string;
  label: string;
  gradient: string;
  items: RecommendedItem[];
}

// ── Rule definitions per scope ────────────────────────────────
export const SCOPE_RECOMMENDATIONS: ScopeRecommendation[] = [
  {
    scopeCode: 'HHS/PS',
    label: 'Handheld / Push Sawing',
    gradient: 'from-emerald-500 to-teal-600',
    items: [
      { key: 'chopsaw', label: 'Chopsaw', inputType: 'checkbox' },
      { key: 'handsaw_20', label: '20\' Handsaw', inputType: 'checkbox' },
      { key: 'handsaw_24', label: '24\' Handsaw', inputType: 'checkbox' },
      { key: 'push_saw', label: 'Push Saw', inputType: 'checkbox' },
      { key: 'hydraulic_hose', label: 'Hydraulic Hose', inputType: 'quantity_ft', placeholder: '0', suffix: 'ft' },
      { key: 'slurry_barrels', label: 'Slurry Barrels', inputType: 'quantity', placeholder: '0', suffix: 'qty' },
      { key: 'gas_power_pack', label: 'Gas Power Pack', inputType: 'checkbox', defaultSelected: true },
    ],
  },
  {
    scopeCode: 'DFS',
    label: 'Diesel Floor Sawing',
    gradient: 'from-violet-500 to-purple-600',
    items: [
      { key: '480_cord', label: '480 Cord', inputType: 'quantity_ft', placeholder: '0', suffix: 'ft' },
      { key: 'slurry_barrels', label: 'Slurry Barrels', inputType: 'quantity', placeholder: '0', suffix: 'qty' },
      { key: 'extra_vacuum', label: 'Extra Vacuum Equipment', inputType: 'checkbox' },
      { key: 'anchor_bolts', label: 'Anchor Bolts', inputType: 'checkbox' },
      { key: 'guard_size', label: 'Guard Size', inputType: 'multi_select', options: ['20"', '30"', '42"'] },
      { key: 'blade_size', label: 'Blade Size', inputType: 'multi_select', options: ['20"', '24"', '26"', '30"', '36"', '42"'] },
    ],
  },
  {
    scopeCode: 'WS/TS',
    label: 'Wall / Track Sawing',
    gradient: 'from-orange-500 to-red-500',
    items: [
      { key: 'saw_system', label: 'Saw System', inputType: 'single_select', options: ['Pentruter System', 'Track Saw'] },
      { key: 'track_length', label: 'Track Length', inputType: 'quantity_ft', placeholder: '0', suffix: 'ft' },
      { key: 'diesel_power_pack', label: 'Diesel Power Pack', inputType: 'checkbox', defaultSelected: true },
    ],
  },
  {
    scopeCode: 'HCD',
    label: 'Hydraulic Core Drilling',
    gradient: 'from-red-500 to-rose-600',
    items: [
      { key: 'hydraulic_hose', label: 'Hydraulic Hose', inputType: 'quantity_ft', placeholder: '0', suffix: 'ft' },
      { key: 'core_drill_stand', label: 'Core Drill Stand', inputType: 'checkbox', defaultSelected: true },
      { key: 'hydraulic_core_drill', label: 'Hydraulic Core Drill', inputType: 'checkbox', defaultSelected: true },
      { key: 'bit_sizes', label: 'Bit Sizes', inputType: 'auto_suggest', autoSuggestField: 'diameter', placeholder: 'e.g. 4", 6"' },
      { key: 'diesel_power_pack', label: 'Diesel Power Pack', inputType: 'checkbox', defaultSelected: true },
    ],
  },
  {
    scopeCode: 'ECD',
    label: 'Electric Core Drilling',
    gradient: 'from-pink-500 to-rose-600',
    items: [
      { key: 'bit_sizes', label: 'Bit Sizes', inputType: 'auto_suggest', autoSuggestField: 'diameter', placeholder: 'e.g. 4", 6"' },
    ],
  },
  {
    scopeCode: 'HFCD',
    label: 'High Frequency Core Drilling',
    gradient: 'from-blue-500 to-indigo-600',
    items: [
      { key: 'bit_sizes', label: 'Bit Sizes', inputType: 'auto_suggest', autoSuggestField: 'diameter', placeholder: 'e.g. 4", 6"' },
    ],
  },
];

/**
 * Get recommendation items for a set of active scope types.
 * Deduplicates items that appear across multiple scopes (e.g., hydraulic hose).
 */
export function getRecommendationsForScopes(
  activeScopes: string[],
  scopeDetails?: Record<string, Record<string, string>>,
): ScopeRecommendation[] {
  return SCOPE_RECOMMENDATIONS
    .filter(rec => activeScopes.includes(rec.scopeCode))
    .map(rec => ({
      ...rec,
      items: rec.items.map(item => {
        // For auto_suggest items, try to derive suggestions from scope details
        if (item.inputType === 'auto_suggest' && item.autoSuggestField && scopeDetails) {
          const scopeData = scopeDetails[rec.scopeCode];
          if (scopeData && scopeData[item.autoSuggestField]) {
            return {
              ...item,
              placeholder: `From scope: ${scopeData[item.autoSuggestField]}"`,
            };
          }
        }
        return item;
      }),
    }));
}

/**
 * Check if a specific scope code has removal-sensitive recommendations.
 * DFS anchor bolts are recommended when removal is needed.
 */
export function getRemovalSensitiveItems(removalNeeded: boolean): Record<string, boolean> {
  if (!removalNeeded) return {};
  return {
    'DFS_anchor_bolts': true, // auto-recommend anchor bolts for DFS when removal is needed
  };
}

// ── Equipment Details State Type ──────────────────────────────
export interface EquipmentDetail {
  selected: boolean;
  quantity?: number;
  value?: string;
  selections?: string[];
}

/**
 * Build initial equipment details from recommendations + current state.
 * Pre-selects defaultSelected items.
 */
export function buildInitialEquipmentDetails(
  recommendations: ScopeRecommendation[],
  existing?: Record<string, EquipmentDetail>,
): Record<string, EquipmentDetail> {
  const details: Record<string, EquipmentDetail> = { ...existing };

  for (const rec of recommendations) {
    for (const item of rec.items) {
      const key = `${rec.scopeCode}_${item.key}`;
      if (!(key in details)) {
        details[key] = {
          selected: item.defaultSelected || false,
          quantity: undefined,
          value: undefined,
          selections: undefined,
        };
      }
    }
  }

  return details;
}
