/**
 * Tests for the equipment-needs derivation used by the Shop Manager
 * "Daily Equipment Needs" view.
 */

import {
  serviceTypeLabel,
  parseServiceCodes,
  selectionsToLines,
  deriveEquipmentLines,
  hasNoEquipment,
} from './equipment-needs';

describe('serviceTypeLabel', () => {
  it('maps known codes to friendly labels', () => {
    expect(serviceTypeLabel('ECD')).toBe('Electric Core Drilling');
    expect(serviceTypeLabel('WS/TS')).toBe('Wall/Track Sawing');
  });
  it('trims and falls back to the raw code when unknown', () => {
    expect(serviceTypeLabel('  ECD ')).toBe('Electric Core Drilling');
    expect(serviceTypeLabel('ZZZ')).toBe('ZZZ');
  });
});

describe('parseServiceCodes', () => {
  it('prefers the service_types array', () => {
    expect(parseServiceCodes(['ECD', ' WS/TS '], 'ignored')).toEqual(['ECD', 'WS/TS']);
  });
  it('falls back to comma-joined job_type string', () => {
    expect(parseServiceCodes(null, 'ECD, WS/TS')).toEqual(['ECD', 'WS/TS']);
  });
  it('returns empty array when nothing present', () => {
    expect(parseServiceCodes(null, null)).toEqual([]);
    expect(parseServiceCodes([], '')).toEqual([]);
  });
});

describe('selectionsToLines', () => {
  it('humanizes item ids and includes the sub-option prefix', () => {
    const lines = selectionsToLines({
      'WS/TS': { _sub: 'pentruder', track_pent: '20', dpp: 'yes' },
    });
    const labels = lines.map((l) => l.label);
    expect(labels).toContain('Wall/Track Sawing (Pentruder): Track Pent');
    expect(labels).toContain('Wall/Track Sawing (Pentruder): Dpp');
    // qty value surfaces as detail, toggle does not
    const track = lines.find((l) => l.label.endsWith('Track Pent'));
    expect(track?.detail).toBe('20');
    const dpp = lines.find((l) => l.label.endsWith('Dpp'));
    expect(dpp?.detail).toBeUndefined();
  });
  it('drops falsy / off values and the _sub meta key', () => {
    const lines = selectionsToLines({
      ECD: { _sub: 'x', slurry_ring: 'no', pump_can: '0', ecd_machine: 'yes' },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].label).toBe('Electric Core Drilling (X): Ecd Machine');
  });
  it('handles null / non-object input', () => {
    expect(selectionsToLines(null)).toEqual([]);
    expect(selectionsToLines(undefined)).toEqual([]);
  });
});

describe('deriveEquipmentLines', () => {
  it('orders mandatory → needed → selections → special and dedupes', () => {
    const lines = deriveEquipmentLines({
      mandatory_equipment: ['DPP'],
      equipment_needed: ['DPP', 'WS'], // DPP duplicate should be dropped
      equipment_selections: { ECD: { ecd_machine: 'yes' } },
      special_equipment: 'Bring extra 200ft cord',
    });
    expect(lines.map((l) => l.source)).toEqual([
      'mandatory',
      'needed',
      'selection',
      'special',
    ]);
    // DPP expands via equipment-map and only appears once
    const dppCount = lines.filter((l) => /Diesel Power Pack/i.test(l.label)).length;
    expect(dppCount).toBe(1);
    expect(lines[lines.length - 1].label).toBe('Bring extra 200ft cord');
  });
  it('returns empty for a job with no equipment fields', () => {
    const lines = deriveEquipmentLines({});
    expect(lines).toEqual([]);
    expect(hasNoEquipment(lines)).toBe(true);
  });
});
