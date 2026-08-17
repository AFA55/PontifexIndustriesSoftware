/**
 * lib/job-ticket-format.test.ts
 *
 * The fixtures marked PROD are the literal values of production job
 * TEST-2026-000103 — the ticket the founder printed on Aug 16 2026 that
 * triggered this work. They are the regression gate: if the printed ticket ever
 * stops listing his sixteen selections, or stops turning the areas JSON into
 * dimensions plus a total, these fail.
 */

import {
  positiveNumber,
  measurementNumber,
  countOf,
  formatNumber,
  humanizeValue,
  parseJsonRows,
  parseAreaRows,
  formatScopeAreas,
  formatScopeCuts,
  formatScopeHoles,
  formatScopeSection,
  formatScopeDetails,
  equipmentItemLabel,
  equipmentSelectionText,
  groupJobEquipment,
  hasNoJobEquipment,
  conditionDistance,
  formatJobsiteConditions,
} from './job-ticket-format';

// PROD — job_orders.scope_details for TEST-2026-000103
const PROD_SCOPE_DETAILS = {
  ECD: {
    holes:
      '[{"qty":"10","bit_size":"4","depth":"8","location":"on_wall"},{"qty":"2","bit_size":"10","depth":"4","location":"elevated_slab"}]',
    lift_or_ladder_onsite: 'no',
  },
  'HHS/PS': {
    cuts: '[{"length":"","width":"","depth":"10","linear_feet":"10"}]',
    areas: '[{"length":"10","width":"10","thickness":"10","qty":"2","overcut_allowed":true}]',
  },
  _removal: { method: 'dumpster_on_site', needed: 'true', equipment: ['dingo'] },
};

// PROD — job_orders.equipment_selections for TEST-2026-000103
const PROD_EQUIPMENT_SELECTIONS = {
  ECD: {
    pump_can: 'yes',
    core_bit_3: '1',
    core_bit_4: '1',
    core_bit_5: '1',
    core_bit_10: '1',
    ecd_machine: 'yes',
    slurry_ring: 'yes',
  },
  'HHS/PS': {
    tape: 'yes',
    plastic: 'yes',
    push_saw: 'yes',
    chalk_line: 'yes',
    handsaw_20: 'yes',
    handsaw_24: 'yes',
    clear_spray: 'yes',
    gas_power_pack: 'yes',
    hydraulic_hose: 'yes',
  },
};

// PROD — job_orders.equipment_needed (typed free text, NOT ticked selections)
const PROD_EQUIPMENT_NEEDED = ['Wall Saw', 'Slab Saw', 'dd160'];

describe('number + text primitives', () => {
  it('positiveNumber accepts numeric strings and rejects junk', () => {
    expect(positiveNumber('10')).toBe(10);
    expect(positiveNumber(10)).toBe(10);
    expect(positiveNumber('1,200')).toBe(1200);
    expect(positiveNumber('  7.5 ')).toBe(7.5);
    expect(positiveNumber('')).toBeNull();
    expect(positiveNumber('abc')).toBeNull();
    expect(positiveNumber('0')).toBeNull();
    expect(positiveNumber('-3')).toBeNull();
    expect(positiveNumber(null)).toBeNull();
    expect(positiveNumber(undefined)).toBeNull();
    expect(positiveNumber(true)).toBeNull();
    expect(positiveNumber(NaN)).toBeNull();
    expect(positiveNumber(Infinity)).toBeNull();
    expect(positiveNumber({})).toBeNull();
  });

  it('positiveNumber refuses a number with a unit stuck to it', () => {
    // REGRESSION: parseFloat("20'") is 20, which made the chain-saw SIZE look
    // like a quantity and printed "chain saw ×20".
    expect(positiveNumber("20'")).toBeNull();
    expect(positiveNumber('10"')).toBeNull();
    expect(positiveNumber('10 ft')).toBeNull();
    expect(positiveNumber('12abc')).toBeNull();
  });

  it('measurementNumber accepts a unit mark, because the thickness box is free text', () => {
    expect(measurementNumber('10"')).toBe(10);
    expect(measurementNumber("22'")).toBe(22);
    expect(measurementNumber('10 ft')).toBe(10);
    expect(measurementNumber('8 in.')).toBe(8);
    expect(measurementNumber('10')).toBe(10);
    expect(measurementNumber('abc')).toBeNull();
    expect(measurementNumber('')).toBeNull();
  });

  it('countOf falls back rather than producing 0', () => {
    expect(countOf('2')).toBe(2);
    expect(countOf('')).toBe(1);
    expect(countOf('abc')).toBe(1);
    expect(countOf(undefined)).toBe(1);
    expect(countOf('2.7')).toBe(2);
    expect(countOf('0.4')).toBe(1); // floors to 0 → falls back
  });

  it('formatNumber groups thousands without depending on the host locale', () => {
    expect(formatNumber(200)).toBe('200');
    expect(formatNumber(1200)).toBe('1,200');
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(10.5)).toBe('10.5');
    expect(formatNumber(10.005)).toBe('10.01');
  });

  it('humanizeValue tidies storage tokens but leaves typed prose alone', () => {
    expect(humanizeValue('elevated_slab')).toBe('Elevated slab');
    expect(humanizeValue('dingo')).toBe('Dingo');
    expect(humanizeValue('no')).toBe('No');
    // Whitespace means a human typed it — never re-case their own note.
    expect(humanizeValue('gate code 1234')).toBe('gate code 1234');
    expect(humanizeValue('')).toBe('');
    expect(humanizeValue(null)).toBe('');
  });

  it('parseJsonRows survives a JSON string, a real array, and garbage', () => {
    expect(parseJsonRows('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(parseJsonRows([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(parseJsonRows('not json')).toEqual([]);
    expect(parseJsonRows('{"a":1}')).toEqual([]); // an object is not rows
    expect(parseJsonRows('')).toEqual([]);
    expect(parseJsonRows(null)).toEqual([]);
    expect(parseJsonRows(['skip me', { a: 1 }, null])).toEqual([{ a: 1 }]);
  });
});

describe('formatScopeAreas', () => {
  it('PROD: renders the founder’s approved shape for TEST-2026-000103', () => {
    const summary = formatScopeAreas(PROD_SCOPE_DETAILS['HHS/PS'].areas);
    expect(summary).not.toBeNull();
    expect(summary!.text).toBe('2 areas — 10\' × 10\' × 10" thick = 200 sq ft total');
    expect(summary!.areaCount).toBe(2);
    expect(summary!.totalSquareFeet).toBe(200);
  });

  it('multiplies square feet by qty and labels the units', () => {
    const s = formatScopeAreas([{ length: '12', width: '4', thickness: '6', qty: '3' }]);
    expect(s!.totalSquareFeet).toBe(144);
    expect(s!.text).toBe('3 areas — 12\' × 4\' × 6" thick = 144 sq ft total');
  });

  it('prefixes the per-row count only when there is more than one row', () => {
    const s = formatScopeAreas([
      { length: '10', width: '10', thickness: '10', qty: '2' },
      { length: '5', width: '4', thickness: '6', qty: '1' },
    ]);
    expect(s!.areaCount).toBe(3);
    expect(s!.text).toBe(
      '3 areas — 2 × 10\' × 10\' × 10" thick, 5\' × 4\' × 6" thick = 220 sq ft total'
    );
  });

  it('handles a missing thickness', () => {
    const s = formatScopeAreas([{ length: '10', width: '10', qty: '1' }]);
    expect(s!.text).toBe("1 area — 10' × 10' = 100 sq ft total");
  });

  it('says WHICH side was entered when only one dimension exists, and omits the total', () => {
    expect(formatScopeAreas([{ length: '10', width: '', thickness: '' }])!.text).toBe(
      "1 area — 10' long"
    );
    expect(formatScopeAreas([{ length: '', width: '8' }])!.text).toBe("1 area — 8' wide");
  });

  it('never throws on blank/garbage input and drops empty rows', () => {
    expect(formatScopeAreas('[]')).toBeNull();
    expect(formatScopeAreas('')).toBeNull();
    expect(formatScopeAreas(null)).toBeNull();
    expect(formatScopeAreas('{{{')).toBeNull();
    expect(formatScopeAreas([{ length: '', width: '', thickness: '', qty: '' }])).toBeNull();
    expect(formatScopeAreas([{ length: 'abc', width: 'def' }])).toBeNull();
  });

  it('keeps a real row when a sibling row is junk', () => {
    const s = formatScopeAreas([
      { length: 'abc', width: '' },
      { length: '10', width: '10', qty: '1' },
    ]);
    expect(s!.rows).toHaveLength(1);
    expect(s!.totalSquareFeet).toBe(100);
  });

  it('treats a blank qty as one area, not zero', () => {
    const rows = parseAreaRows([{ length: '10', width: '10', qty: '' }]);
    expect(rows[0].qty).toBe(1);
    expect(rows[0].squareFeet).toBe(100);
  });

  it('accepts `depth` as an alias of `thickness` (older rows)', () => {
    expect(formatScopeAreas([{ length: '4', width: '4', depth: '8' }])!.text).toBe(
      '1 area — 4\' × 4\' × 8" thick = 16 sq ft total'
    );
  });
});

describe('formatScopeCuts', () => {
  it('PROD: renders the HHS/PS cut row (blank L/W, depth + linear feet)', () => {
    const s = formatScopeCuts(PROD_SCOPE_DETAILS['HHS/PS'].cuts);
    expect(s!.text).toBe('1 cut — 10 LF @ 10" deep = 10 LF total');
    expect(s!.totalLinearFeet).toBe(10);
  });

  it('sums several cuts', () => {
    const s = formatScopeCuts([
      { linear_feet: '10', depth: '10' },
      { linear_feet: '25', depth: '6' },
    ]);
    expect(s!.cutCount).toBe(2);
    expect(s!.text).toBe('2 cuts — 10 LF @ 10" deep, 25 LF @ 6" deep = 35 LF total');
  });

  it('prints L × W when the cut was entered as a rectangle', () => {
    const s = formatScopeCuts([{ length: '10', width: '4', depth: '6' }]);
    expect(s!.text).toBe('1 cut — 10\' × 4\' @ 6" deep');
  });

  it('returns null on junk', () => {
    expect(formatScopeCuts('nope')).toBeNull();
    expect(formatScopeCuts([{ length: '', width: '', depth: '', linear_feet: '' }])).toBeNull();
  });
});

describe('formatScopeHoles', () => {
  it('PROD: renders both ECD hole rows with their bit sizes and locations', () => {
    const s = formatScopeHoles(PROD_SCOPE_DETAILS.ECD.holes);
    expect(s!.holeCount).toBe(12);
    expect(s!.text).toBe(
      '12 holes — 10 × 4" bit @ 8" deep (on wall), 2 × 10" bit @ 4" deep (elevated slab)'
    );
  });

  it('returns null on junk', () => {
    expect(formatScopeHoles('[]')).toBeNull();
    expect(formatScopeHoles(undefined)).toBeNull();
  });
});

describe('formatScopeSection / formatScopeDetails', () => {
  it('PROD: builds one section per service plus the removal entry', () => {
    const sections = formatScopeDetails(PROD_SCOPE_DETAILS);
    expect(sections.map((s) => s.code)).toEqual(['ECD', 'HHS/PS', '_removal']);

    const ecd = sections[0];
    expect(ecd.label).toBe('Electric Core Drilling');
    expect(ecd.lines[0]).toContain('12 holes');
    // A plain field the office filled in must not vanish either.
    expect(ecd.lines).toContain('Lift/ladder on site: No');

    const hhs = sections[1];
    expect(hhs.label).toBe('Handheld / Push Sawing');
    expect(hhs.lines).toEqual([
      '1 cut — 10 LF @ 10" deep = 10 LF total',
      '2 areas — 10\' × 10\' × 10" thick = 200 sq ft total',
    ]);

    expect(sections[2].label).toBe('Material Removal');
    expect(sections[2].lines[0]).toBe('Dumpster on site — Dingo');
  });

  it('drops a service with nothing measured rather than printing an empty heading', () => {
    expect(formatScopeSection('ECD', {})).toBeNull();
    expect(formatScopeSection('ECD', { holes: '[]', cuts: '', areas: '' })).toBeNull();
    expect(formatScopeSection('ECD', null)).toBeNull();
    expect(formatScopeDetails(null)).toEqual([]);
    expect(formatScopeDetails({})).toEqual([]);
  });

  it('skips a removal entry that was not requested', () => {
    const sections = formatScopeDetails({ _removal: { needed: 'false', method: 'hand' } });
    expect(sections).toEqual([]);
  });

  it('keeps an unknown service code as its own heading', () => {
    const s = formatScopeSection('ZZZ', { linear_feet: '40' });
    expect(s!.label).toBe('ZZZ');
    expect(s!.lines).toEqual(['Linear feet: 40 LF']);
  });
});

describe('equipment labels', () => {
  it('turns storage keys into the founder’s wording', () => {
    expect(equipmentItemLabel('core_bit_10')).toBe('10" core bit');
    expect(equipmentItemLabel('core_bit_3')).toBe('3" core bit');
    expect(equipmentItemLabel('handsaw_20')).toBe('20" handsaw');
    expect(equipmentItemLabel('gas_power_pack')).toBe('gas power pack');
    expect(equipmentItemLabel('pump_can')).toBe('pump can');
    expect(equipmentItemLabel('slurry_ring')).toBe('slurry ring');
  });

  it('prints an UNRECOGNISED key rather than dropping it', () => {
    // A dropped tool is how a crew arrives without one — the whole point.
    expect(equipmentItemLabel('mystery_widget_9')).toBe('mystery widget 9');
    expect(equipmentItemLabel('')).toBe('');
  });

  it('does not invent inches for keys whose number is not a size', () => {
    expect(equipmentItemLabel('480_cord')).toBe('480 cord');
  });
});

describe('equipmentSelectionText', () => {
  it('treats the toggle vocabulary correctly', () => {
    expect(equipmentSelectionText('pump_can', 'yes')).toBe('pump can');
    expect(equipmentSelectionText('pump_can', true)).toBe('pump can');
    expect(equipmentSelectionText('pump_can', 'no')).toBeNull();
    expect(equipmentSelectionText('pump_can', 'false')).toBeNull();
    expect(equipmentSelectionText('pump_can', '0')).toBeNull();
    expect(equipmentSelectionText('pump_can', '')).toBeNull();
    expect(equipmentSelectionText('pump_can', null)).toBeNull();
  });

  it('keeps quantities where they matter and hides a redundant ×1', () => {
    expect(equipmentSelectionText('core_bit_4', '1')).toBe('4" core bit');
    expect(equipmentSelectionText('core_bit_4', '3')).toBe('4" core bit ×3');
    expect(equipmentSelectionText('slurry_drums', '2')).toBe('slurry drums ×2');
  });

  it('renders a footage item as a length, not a count', () => {
    expect(equipmentSelectionText('hydraulic_hose', '50')).toBe('hydraulic hose — 50 ft');
    expect(equipmentSelectionText('480_cord', '100')).toBe('480 cord — 100 ft');
    // PROD stores the HHS/PS hose as a plain toggle — still just the label.
    expect(equipmentSelectionText('hydraulic_hose', 'yes')).toBe('hydraulic hose');
  });

  it('shows an option pick verbatim', () => {
    expect(equipmentSelectionText('chain_saw', "20'")).toBe("chain saw (20')");
  });
});

describe('groupJobEquipment', () => {
  it('PROD: prints all sixteen selections grouped by service, plus CUSTOM', () => {
    const groups = groupJobEquipment({
      equipment_selections: PROD_EQUIPMENT_SELECTIONS,
      equipment_needed: PROD_EQUIPMENT_NEEDED,
      equipment_rentals: [],
    });

    expect(groups.map((g) => g.key)).toEqual(['ECD', 'HHS/PS', 'CUSTOM']);

    // Non-bit items keep the office's order; core bits sort ascending after them.
    expect(groups[0].items).toEqual([
      'pump can',
      'ECD machine',
      'slurry ring',
      '3" core bit',
      '4" core bit',
      '5" core bit',
      '10" core bit',
    ]);

    expect(groups[1].items).toEqual([
      'tape',
      'plastic',
      'push saw',
      'chalk line',
      '20" handsaw',
      '24" handsaw',
      'clear spray',
      'gas power pack',
      'hydraulic hose',
    ]);

    // The three items the ticket USED to present as the whole list.
    expect(groups[2].items).toEqual(['Wall Saw', 'Slab Saw', 'dd160']);
    expect(groups[2].label).toBe('CUSTOM');

    // Nothing selected may be lost: 7 + 9 = 16, plus 3 typed.
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(19);
  });

  it('labels a WS/TS group with its system sub-option and never lists _sub as gear', () => {
    const groups = groupJobEquipment({
      equipment_selections: {
        'WS/TS': { _sub: 'pentruder', track_pent: '20', '32_guard': 'yes' },
      },
    });
    expect(groups[0].label).toBe('WS/TS (Pentruder)');
    expect(groups[0].sublabel).toBe('Wall/Track Sawing');
    expect(groups[0].items).toEqual(['track (Pentruder) — 20 ft', '32" guard']);
  });

  it('omits RENTAL entirely when there is nothing to rent', () => {
    const groups = groupJobEquipment({
      equipment_selections: { ECD: { pump_can: 'yes' } },
      equipment_rentals: [],
    });
    expect(groups.some((g) => g.key === 'RENTAL')).toBe(false);
  });

  it('adds RENTAL from the rentals array and from flagged custom items, deduped', () => {
    const groups = groupJobEquipment({
      equipment_needed: ['Wall Saw', 'Scissor Lift'],
      equipment_rentals: ['Scissor Lift (PICKUP REQUIRED)'],
      equipment_rental_flags: { 'Scissor Lift': true },
    });
    const custom = groups.find((g) => g.key === 'CUSTOM')!;
    const rental = groups.find((g) => g.key === 'RENTAL')!;
    // A flagged item is a rental, listed once — not in both groups.
    expect(custom.items).toEqual(['Wall Saw']);
    expect(rental.items).toEqual(['Scissor Lift (PICKUP REQUIRED)', 'Scissor Lift']);
  });

  it('drops a service whose picks are all switched off', () => {
    const groups = groupJobEquipment({
      equipment_selections: { ECD: { pump_can: 'no', slurry_ring: 'false' } },
    });
    expect(groups).toEqual([]);
    expect(hasNoJobEquipment(groups)).toBe(true);
  });

  it('never throws on missing / malformed input', () => {
    expect(groupJobEquipment({})).toEqual([]);
    expect(groupJobEquipment({ equipment_selections: null, equipment_needed: null })).toEqual([]);
    expect(
      groupJobEquipment({ equipment_selections: { ECD: 'nope' } as never })
    ).toEqual([]);
    expect(groupJobEquipment({ equipment_needed: ['', '  '] })).toEqual([]);
  });
});

describe('jobsite conditions', () => {
  it('reads a distance under EITHER naming convention', () => {
    // What production writes today…
    expect(conditionDistance({ electricity_available_ft: 75 }, 'electricity_available')).toBe(75);
    // …and the key being added concurrently.
    expect(conditionDistance({ electricity_distance_ft: 75 }, 'electricity_available')).toBe(75);
    expect(conditionDistance({ electricity_available_distance_ft: 75 }, 'electricity_available')).toBe(75);
    expect(conditionDistance({ hyd_hose_ft: '40' }, 'hyd_hose')).toBe(40);
    expect(conditionDistance({ cord_480_ft: 100 }, 'cord_480')).toBe(100);
    expect(conditionDistance({}, 'electricity_available')).toBeNull();
    expect(conditionDistance({ electricity_available_ft: '' }, 'electricity_available')).toBeNull();
    expect(conditionDistance({ electricity_available_ft: 'abc' }, 'electricity_available')).toBeNull();
  });

  it('prints the founder’s example line', () => {
    expect(
      formatJobsiteConditions({ electricity_available: true, electricity_distance_ft: 75 })
    ).toEqual(['Power available — 75 ft']);
  });

  it('prints the plain label when no distance key is present', () => {
    expect(formatJobsiteConditions({ electricity_available: true })).toEqual(['Power available']);
  });

  it('renders a full real-world condition set in ticket order', () => {
    expect(
      formatJobsiteConditions({
        water_available: true,
        water_available_ft: 120,
        electricity_available: true,
        electricity_distance_ft: 75,
        cord_480: false,
        hyd_hose: true,
        hyd_hose_ft: 40,
        water_control: true,
        clean_up_required: true,
        high_work: true,
        high_work_ft: 22,
        high_work_access: 'lift_provided',
        inside_outside: 'inside',
      })
    ).toEqual([
      'Water available — 120 ft',
      'Power available — 75 ft',
      'Hyd hose — 40 ft',
      'Vac water',
      'Cleanup required',
      'High work — 22 ft',
      'Work location: Inside',
      'High-work access: Lift provided',
    ]);
  });

  it('never emits a bare distance key as its own line', () => {
    // The condition is OFF but its footage lingered — it must not print alone.
    const lines = formatJobsiteConditions({ electricity_available: false, electricity_available_ft: 75 });
    expect(lines).toEqual([]);
  });

  it('reads inside/outside whichever editor wrote it', () => {
    // Schedule form writes 'inside'; the schedule board's Job Detail editor
    // writes 'Inside' (lib/jobsite-conditions.ts). Both must read the same.
    expect(formatJobsiteConditions({ inside_outside: 'inside' })).toEqual(['Work location: Inside']);
    expect(formatJobsiteConditions({ inside_outside: 'Inside' })).toEqual(['Work location: Inside']);
    expect(formatJobsiteConditions({ inside_outside: 'outside' })).toEqual(['Work location: Outside']);
    // A value neither editor's enum covers still prints rather than vanishing.
    expect(formatJobsiteConditions({ inside_outside: 'Both' })).toEqual(['Work location: Both']);
  });

  it('prints an unknown truthy condition rather than dropping it', () => {
    expect(formatJobsiteConditions({ confined_space_entry: true })).toEqual([
      'Confined space entry',
    ]);
    expect(formatJobsiteConditions({ access_notes: 'gate code 1234' })).toEqual([
      'Access notes: gate code 1234',
    ]);
  });

  it('is empty for the {} case that a separate save bug produces', () => {
    expect(formatJobsiteConditions({})).toEqual([]);
    expect(formatJobsiteConditions(null)).toEqual([]);
    expect(formatJobsiteConditions(undefined)).toEqual([]);
  });
});
