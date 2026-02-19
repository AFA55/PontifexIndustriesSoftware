// ── Work Item Utility Functions ──
// Extracted from work-performed/page.tsx for reuse and cleaner code

import type { CutArea } from './work-item-constants';

// ── Type detection helpers ──

export const isCoreDrilling = (itemName: string): boolean => {
  return itemName.includes('CORE DRILL');
};

export const isSawing = (itemName: string): boolean => {
  return itemName.includes('SAW') && !itemName.includes('CORE DRILL');
};

export const isHandSaw = (itemName: string): boolean => {
  return itemName.includes('HAND SAW');
};

export const isSlabSaw = (itemName: string): boolean => {
  return itemName.includes('SLAB SAW');
};

export const isWallSaw = (itemName: string): boolean => {
  return itemName.includes('WALL SAW');
};

export const isChainsaw = (itemName: string): boolean => {
  return itemName.includes('CHAIN SAW');
};

export const isBreakAndRemove = (itemName: string): boolean => {
  return itemName.includes('BREAK & REMOVE') || itemName.includes('REMOVAL') || itemName.includes('DEMOLITION');
};

export const isJackHammering = (itemName: string): boolean => {
  return itemName.includes('JACK HAMMERING') || itemName.includes('JACKHAMMER');
};

export const isChipping = (itemName: string): boolean => {
  return itemName.includes('CHIPPING');
};

export const isBrokk = (itemName: string): boolean => {
  return itemName.includes('BROKK');
};

/** Returns true if the item requires detailed data entry (core drilling or sawing forms). */
export const requiresDetailedData = (itemName: string): boolean => {
  return itemName.includes('CORE DRILL') ||
         itemName.includes('SAW') ||
         itemName.includes('CUTTING');
};

// ── Calculation helpers ──

/** Calculate linear feet from a cut area (perimeter × quantity). */
export const calculateLinearFeetFromArea = (area: CutArea): number => {
  const perimeter = (2 * area.length) + (2 * area.width);
  return perimeter * (area.quantity || 1);
};

/** Calculate total linear feet from an array of cut areas. */
export const calculateTotalFromAreas = (areas: CutArea[]): number => {
  return areas.reduce((total, area) => total + calculateLinearFeetFromArea(area), 0);
};

/** Get available blades/chains for a given saw type. */
export const getBladesForSawType = (itemName: string): string[] => {
  if (isHandSaw(itemName)) {
    return ['20" Hand Saw', '24" Hand Saw', '30" Hand Saw'];
  }

  if (isChainsaw(itemName)) {
    return ['10" Chain', '15" Chain', '20" Chain', '24" Chain'];
  }

  if (isWallSaw(itemName)) {
    return ['32" Diamond', '42" Diamond', '56" Diamond', '62" Diamond', '72" Diamond'];
  }

  if (isSlabSaw(itemName)) {
    return [
      '20" Diamond',
      '24" Diamond',
      '26" Diamond',
      '30" Diamond',
      '32" Diamond',
      '36" Diamond',
      '42" Diamond',
      '54" Diamond',
      '62" Diamond',
      '72" Diamond'
    ];
  }

  // Standard blades for other saw types
  return [
    '7" Diamond',
    '9" Diamond',
    '12" Diamond',
    '14" Diamond',
    '16" Diamond',
    '18" Diamond',
    '20" Diamond',
    '24" Diamond',
    'Abrasive',
    'Masonry',
    'Metal Cutting',
    'Wire Saw'
  ];
};

// ── Assigned blade types ──

export interface AssignedBlade {
  assignment_id: string;
  equipment_id: string;
  name: string;
  serial_number: string;
  manufacturer: string;
  model_number: string;
  size: string;
  equipment_for: string;
  equipment_category: string;
  total_usage_linear_feet: number;
  purchase_price: number | null;
  assigned_date: string;
}

/**
 * Map a work item name to the equipment_for value used in the DB.
 * e.g. "HAND SAW" → "hand_saw_flush_cut", "SLAB SAW" → "slab_saw"
 */
export const mapSawTypeToEquipmentFor = (itemName: string): string | null => {
  const lower = itemName.toLowerCase();
  if (lower.includes('hand saw') || lower.includes('flush cut')) return 'hand_saw_flush_cut';
  if (lower.includes('slab saw') || lower.includes('electric slab')) return 'slab_saw';
  if (lower.includes('wall saw')) return 'wall_saw';
  if (lower.includes('chain saw') || lower.includes('chainsaw')) return 'chain_saw';
  if (lower.includes('chop saw')) return 'chop_saw';
  if (lower.includes('ring saw')) return 'ring_saw';
  if (lower.includes('wire saw')) return 'wire_saw';
  return null;
};

/**
 * Get assigned blades for a specific saw type from the operator's blade inventory.
 * Returns matching blades from the operator's actual assigned equipment.
 * Falls back to empty array if no blades match.
 */
export const getAssignedBladesForSawType = (
  allAssignedBlades: Record<string, AssignedBlade[]>,
  itemName: string
): AssignedBlade[] => {
  const equipmentFor = mapSawTypeToEquipmentFor(itemName);
  if (!equipmentFor) return [];
  return allAssignedBlades[equipmentFor] || [];
};

/**
 * Format a blade for display in the UI.
 * e.g. "Husqvarna Elite Pro 3000 20" (S/N: 009) — 150 LF used"
 */
export const formatBladeLabel = (blade: AssignedBlade): string => {
  const parts = [];
  if (blade.manufacturer) parts.push(blade.manufacturer);
  if (blade.model_number) parts.push(blade.model_number);
  if (blade.size) parts.push(`${blade.size}"`);

  let label = parts.join(' ') || blade.name;
  if (blade.serial_number) label += ` (S/N: ${blade.serial_number})`;
  if (blade.total_usage_linear_feet > 0) {
    label += ` — ${blade.total_usage_linear_feet.toLocaleString()} LF used`;
  }
  return label;
};
