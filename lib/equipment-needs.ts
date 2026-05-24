/**
 * Equipment-needs derivation for the Shop Manager "Daily Equipment Needs" view.
 *
 * Pure helpers — no DB / no React. Given the equipment-related fields stored on
 * a `job_orders` row (surfaced via `schedule_board_view`), produce a flat,
 * de-duplicated, human-readable list of gear the shop should stage for the day.
 *
 * Source fields (all optional / sparse in practice):
 *   - mandatory_equipment: TEXT[]   — must-have items (highest priority)
 *   - equipment_needed:    TEXT[]   — additional requested items
 *   - equipment_selections: jsonb   — per-service-code structured picks
 *                                     { 'WS/TS': { _sub: 'pentruder', track_pent: '20', dpp: 'yes' }, ... }
 *   - special_equipment:   string   — free-text notes
 *   - service_types:       string[] — service codes (e.g. ['ECD','WS/TS'])
 *   - job_type:            string   — comma-joined service codes fallback
 */

import { getDisplayName } from './equipment-map';

/** Human-readable label for each service code (mirrors schedule-form SERVICE_TYPES). */
export const SERVICE_TYPE_LABELS: Record<string, string> = {
  ECD: 'Electric Core Drilling',
  HFCD: 'High Frequency Core Drilling',
  HCD: 'Hydraulic Core Drilling',
  DFS: 'Diesel Floor Sawing',
  EFS: 'Electric Floor Sawing',
  'WS/TS': 'Wall/Track Sawing',
  CS: 'Chain Sawing',
  'HHS/PS': 'Handheld / Push Sawing',
  WireSaw: 'Wire Sawing',
  GPR: 'GPR Scanning',
  Demo: 'Selective Demo',
  Brokk: 'Brokk',
  Other: 'Other',
};

/** Turn a service code into its friendly label (falls back to the raw code). */
export function serviceTypeLabel(code: string): string {
  const trimmed = (code || '').trim();
  return SERVICE_TYPE_LABELS[trimmed] ?? trimmed;
}

/**
 * Parse a job's `job_type` / `service_types` into an array of service codes.
 * Accepts either an array (service_types) or a comma-joined string (job_type).
 */
export function parseServiceCodes(
  serviceTypes?: string[] | null,
  jobType?: string | null
): string[] {
  if (Array.isArray(serviceTypes) && serviceTypes.length > 0) {
    return serviceTypes.map((s) => (s || '').trim()).filter(Boolean);
  }
  if (jobType && typeof jobType === 'string') {
    return jobType
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** A single derived equipment line for display. */
export interface EquipmentLine {
  label: string;
  /** Where it came from — drives chip color / priority in the UI. */
  source: 'mandatory' | 'needed' | 'selection' | 'special';
  /** Optional qty/sub-option detail (e.g. "20 ft", "Pentruder"). */
  detail?: string;
}

const TRUTHY = new Set(['yes', 'true', '1', 'on']);

/**
 * Format a single item id from `equipment_selections` into a readable label.
 * Item ids are snake_case (e.g. `track_pent`, `dpp`); we humanize them.
 */
function humanizeItemId(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Flatten `equipment_selections` jsonb into EquipmentLines.
 * Skips the `_sub` meta key (captured separately as a detail prefix) and any
 * falsy / "no" / "0" values.
 */
export function selectionsToLines(
  selections?: Record<string, Record<string, unknown>> | null
): EquipmentLine[] {
  if (!selections || typeof selections !== 'object') return [];
  const lines: EquipmentLine[] = [];

  for (const [code, picks] of Object.entries(selections)) {
    if (!picks || typeof picks !== 'object') continue;
    const sub = typeof picks._sub === 'string' ? String(picks._sub) : undefined;

    for (const [itemId, rawVal] of Object.entries(picks)) {
      if (itemId === '_sub') continue;
      const val = rawVal == null ? '' : String(rawVal).trim();
      if (!val) continue;
      const lower = val.toLowerCase();
      // Drop explicit "off" states.
      if (lower === 'no' || lower === 'false' || lower === '0' || lower === 'off') continue;

      const isToggle = TRUTHY.has(lower);
      const codeLabel = serviceTypeLabel(code);
      const subPrefix = sub ? ` (${humanizeItemId(sub)})` : '';
      lines.push({
        label: `${codeLabel}${subPrefix}: ${humanizeItemId(itemId)}`,
        source: 'selection',
        detail: isToggle ? undefined : val,
      });
    }
  }
  return lines;
}

/** Normalize a raw text item into an EquipmentLine, expanding known abbreviations. */
function textToLine(raw: string, source: EquipmentLine['source']): EquipmentLine | null {
  const item = (raw || '').trim();
  if (!item) return null;
  return { label: getDisplayName(item), source };
}

export interface DeriveEquipmentInput {
  mandatory_equipment?: string[] | null;
  equipment_needed?: string[] | null;
  equipment_selections?: Record<string, Record<string, unknown>> | null;
  special_equipment?: string | null;
}

/**
 * Build the de-duplicated, ordered list of equipment lines for one job.
 * Order: mandatory → needed → structured selections → special notes.
 * De-dup is case-insensitive on the resulting label, keeping the highest-priority
 * (earliest) source.
 */
export function deriveEquipmentLines(job: DeriveEquipmentInput): EquipmentLine[] {
  const out: EquipmentLine[] = [];
  const seen = new Set<string>();

  const push = (line: EquipmentLine | null) => {
    if (!line) return;
    const key = line.label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(line);
  };

  for (const m of job.mandatory_equipment ?? []) push(textToLine(m, 'mandatory'));
  for (const e of job.equipment_needed ?? []) push(textToLine(e, 'needed'));
  for (const s of selectionsToLines(job.equipment_selections)) push(s);

  const special = (job.special_equipment ?? '').trim();
  if (special) push({ label: special, source: 'special' });

  return out;
}

/** True when a job has no concrete equipment lines (UI shows a fallback). */
export function hasNoEquipment(lines: EquipmentLine[]): boolean {
  return lines.length === 0;
}
