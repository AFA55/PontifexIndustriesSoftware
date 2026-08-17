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
  scopeLocationLabel,
  scopeLocationLabelInline,
  rowLocationLabel,
  layoutEquipmentColumns,
  formatScopeQuantity,
  scopeItemDetail,
  formatScopeItems,
  scopeItemsHaveDetail,
  ppeLabel,
  formatPpeAndSafety,
  booleanish,
  parseCrossCut,
  crossCutText,
  formatPermits,
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

  it('a STRING "false" reads as NO, not as a truthy yes', () => {
    // Production stores real booleans today, so this changes nothing now. But
    // 'false' is a truthy JavaScript string, and the old raw-truthiness test
    // would have printed "Power available" over an explicit no — the one
    // direction that sends a crew to site without a generator.
    expect(formatJobsiteConditions({ electricity_available: 'false' })).toEqual(['Power: NO']);
    expect(formatJobsiteConditions({ water_available: '0' })).toEqual(['Water: NO']);
    // …while a real boolean false is unchanged, and 'true'/'yes' still print.
    expect(formatJobsiteConditions({ electricity_available: false })).toEqual(['Power: NO']);
    expect(formatJobsiteConditions({ electricity_available: 'yes' })).toEqual(['Power available']);
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
    // The condition is OFF but its footage lingered. The FOOTAGE must not print
    // alone ("Electricity available ft: 75" beside a power source that isn't
    // there). Power itself is a SUPPLY condition, so a recorded `false` now says
    // so explicitly — see the supply-condition block below.
    const lines = formatJobsiteConditions({ electricity_available: false, electricity_available_ft: 75 });
    expect(lines).toEqual(['Power: NO']);
  });

  it('never emits a bare distance key for a NON-supply condition either', () => {
    const lines = formatJobsiteConditions({ hyd_hose: false, hyd_hose_ft: 50 });
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

// ── Where the work happens (the "core drilling always printed —" bug) ───────

describe('scopeLocationLabel', () => {
  it('PROD: maps the three tokens the schedule form actually writes', () => {
    // Verified against the ECD hole buttons in the schedule form AND against
    // the values stored on TEST-2026-000103.
    expect(scopeLocationLabel('on_wall')).toBe('On wall');
    expect(scopeLocationLabel('elevated_slab')).toBe('Elevated slab');
    expect(scopeLocationLabel('slab_on_grade')).toBe('Slab on grade (SOG)');
  });

  it('is empty for the deselected/absent case so callers can fall back', () => {
    expect(scopeLocationLabel('')).toBe('');
    expect(scopeLocationLabel(null)).toBe('');
    expect(scopeLocationLabel(undefined)).toBe('');
    expect(scopeLocationLabel('   ')).toBe('');
  });

  it('prints an unknown token rather than dropping it', () => {
    // A blank wall/floor cell is how a crew turns up without a lift.
    expect(scopeLocationLabel('under_slab')).toBe('Under slab');
    expect(scopeLocationLabel('SLAB_ON_GRADE')).toBe('Slab on grade (SOG)');
    expect(scopeLocationLabel('third floor landing')).toBe('third floor landing');
  });

  it('keeps the SOG acronym when used mid-sentence', () => {
    expect(scopeLocationLabelInline('on_wall')).toBe('on wall');
    expect(scopeLocationLabelInline('elevated_slab')).toBe('elevated slab');
    expect(scopeLocationLabelInline('slab_on_grade')).toBe('slab on grade (SOG)');
  });
});

describe('rowLocationLabel', () => {
  it("PROD: reads the HOLE's own location (TEST-2026-000103)", () => {
    const holes = JSON.parse(PROD_SCOPE_DETAILS.ECD.holes);
    expect(rowLocationLabel(holes[0], PROD_SCOPE_DETAILS.ECD)).toBe('On wall');
    expect(rowLocationLabel(holes[1], PROD_SCOPE_DETAILS.ECD)).toBe('Elevated slab');
  });

  it('PROD: falls back to the legacy SERVICE-level work_location', () => {
    // JOB-2026-402357 and JOB-2026-880425 store it one level up, on the
    // service, with no per-hole location at all.
    expect(rowLocationLabel({ qty: '80', bit_size: '8' }, { work_location: 'on_wall' })).toBe('On wall');
    expect(rowLocationLabel({ qty: '3' }, { work_location: 'elevated_slab' })).toBe('Elevated slab');
  });

  it('prefers the row over the service when both are present', () => {
    expect(rowLocationLabel({ location: 'on_wall' }, { work_location: 'elevated_slab' })).toBe('On wall');
  });

  it('falls back to the oldest free-text keys, then to empty', () => {
    expect(rowLocationLabel(null, { material: 'reinforced concrete' })).toBe('reinforced concrete');
    expect(rowLocationLabel(null, { wall_floor_type: 'floor' })).toBe('On floor');
    expect(rowLocationLabel(null, {})).toBe('');
    expect(rowLocationLabel(undefined, undefined)).toBe('');
    // Junk in must not throw — this runs inside a PDF render.
    expect(rowLocationLabel('nonsense', 42)).toBe('');
  });
});

// ── Equipment column layout (legibility of the printed EQUIPMENT REQ'D box) ─

describe('layoutEquipmentColumns', () => {
  const groups = groupJobEquipment({
    equipment_selections: PROD_EQUIPMENT_SELECTIONS,
    equipment_needed: PROD_EQUIPMENT_NEEDED,
  });

  it('PROD: keeps every selection, one row per item, across two columns', () => {
    const cols = layoutEquipmentColumns(groups, 2);
    expect(cols).toHaveLength(2);
    const items = cols.flat().filter((r) => r.kind === 'item').map((r) => r.text);
    const expected = groups.flatMap((g) => g.items);
    // NEVER DROP A SELECTION — the rule this whole file exists for.
    expect(items.sort()).toEqual(expected.sort());
  });

  it('balances the two columns instead of splitting down the middle', () => {
    const cols = layoutEquipmentColumns(groups, 2);
    const rows = cols.map((c) => c.length);
    expect(Math.abs(rows[0] - rows[1])).toBeLessThanOrEqual(2);
  });

  it('never ends a column on a service heading', () => {
    // An orphaned service name at the foot of a column reads as "this service
    // needs nothing" — the opposite of the truth.
    for (let n = 1; n <= 30; n += 1) {
      const synthetic = Array.from({ length: n }, (_, i) => ({
        key: `S${i}`,
        label: `S${i}`,
        sublabel: '',
        items: Array.from({ length: (i % 4) + 1 }, (_, j) => `item ${i}-${j}`),
      }));
      for (const col of layoutEquipmentColumns(synthetic, 2)) {
        if (col.length === 0) continue;
        const last = col[col.length - 1];
        expect(last.kind === 'item' || last.continued === true).toBe(true);
      }
    }
  });

  it('repeats the heading as "(cont.)" when a service straddles the columns', () => {
    const cols = layoutEquipmentColumns(
      [{ key: 'ECD', label: 'ECD', sublabel: '', items: Array.from({ length: 12 }, (_, i) => `bit ${i}`) }],
      2
    );
    expect(cols[1][0]).toMatchObject({ kind: 'heading', text: 'ECD (cont.)', continued: true });
    // …and no item is left sitting under the wrong service name.
    expect(cols[0][0]).toMatchObject({ kind: 'heading', text: 'ECD' });
  });

  it('falls back to one column rather than leaving a blank half-box', () => {
    const tiny = [{ key: 'CS', label: 'CS', sublabel: '', items: ['chain saw'] }];
    const cols = layoutEquipmentColumns(tiny, 2);
    expect(cols).toHaveLength(1);
    expect(cols[0].map((r) => r.text)).toEqual(['CS', 'chain saw']);
  });

  it('is empty for a job with no equipment', () => {
    expect(layoutEquipmentColumns([], 2)).toEqual([]);
  });

  it('still prints a service whose only pick is the machine', () => {
    // DFS can store `{"_sub":"husqvarna_7000"}` and nothing else; the group has
    // no items but the saw still has to be loaded on the truck.
    const cols = layoutEquipmentColumns(
      [{ key: 'DFS', label: 'DFS (Husqvarna 7000)', sublabel: 'Diesel Floor Sawing', items: [] }],
      2
    );
    expect(cols.flat().map((r) => r.text)).toEqual(['DFS (Husqvarna 7000)']);
  });
});

describe('groupJobEquipment — machine-only service', () => {
  it('keeps a service whose only pick is the `_sub` machine', () => {
    const groups = groupJobEquipment({ equipment_selections: { DFS: { _sub: 'husqvarna_7000' } } });
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('DFS (Husqvarna 7000)');
    expect(groups[0].items).toEqual([]);
  });

  it('still drops a service where nothing at all was ticked', () => {
    expect(groupJobEquipment({ equipment_selections: { DFS: { chalk_line: 'no' } } })).toEqual([]);
    expect(groupJobEquipment({ equipment_selections: { DFS: {} } })).toEqual([]);
  });
});

// ── Service items (job_scope_items) ─────────────────────────────────────────
//
// PROD — the two rows off the founder's Aug 17 printout, verbatim from
// job_scope_items, plus the two hand-typed descriptions that also exist in
// production and must survive untouched.

describe('formatScopeQuantity — the unit vocabulary that is actually in the DB', () => {
  it('prints linear feet as the total, not a count plus a raw key', () => {
    // The printout said "48 linear_ft".
    expect(formatScopeQuantity(48, 'linear_ft')).toBe('48 LF');
    expect(formatScopeQuantity('913.00', 'linear_ft')).toBe('913 LF');
    expect(formatScopeQuantity(3280, 'linear_ft')).toBe('3,280 LF');
  });

  it('prints a percentage glued to its number, never the word "percent"', () => {
    // The printout said "100 percent".
    expect(formatScopeQuantity(100, 'percent')).toBe('100%');
    expect(formatScopeQuantity(50, 'percent')).toBe('50%');
  });

  it('singularises a count of one', () => {
    expect(formatScopeQuantity(1, 'holes')).toBe('1 hole');
    expect(formatScopeQuantity(80, 'holes')).toBe('80 holes');
    expect(formatScopeQuantity(1, 'items')).toBe('1 item');
    expect(formatScopeQuantity(2, 'hours')).toBe('2 hrs');
    expect(formatScopeQuantity(1, 'hours')).toBe('1 hr');
    expect(formatScopeQuantity(1, 'loads')).toBe('1 load');
  });

  it('reads the writable units the app never happened to store yet', () => {
    // schedule-form ALLOWED_UNITS + lib/job-progress ScopeUnit.
    expect(formatScopeQuantity(200, 'sq_ft')).toBe('200 sq ft');
    expect(formatScopeQuantity(4, 'each')).toBe('4 ea');
  });

  it('reads the operator-side spelling, which uses spaces not underscores', () => {
    // lib/work-types UNIT_CHOICES / defaultUnitFor.
    expect(formatScopeQuantity(48, 'linear ft')).toBe('48 LF');
    expect(formatScopeQuantity(200, 'sq ft')).toBe('200 sq ft');
    expect(formatScopeQuantity(3, 'loads')).toBe('3 loads');
  });

  it('reads the takeoff/estimating abbreviations and the UI title-case labels', () => {
    // takeoff_conditions.unit is LF / EA / SF; JobScopePanel labels are 'Linear Ft'.
    expect(formatScopeQuantity(7, 'LF')).toBe('7 LF');
    expect(formatScopeQuantity(1, 'EA')).toBe('1 ea');
    expect(formatScopeQuantity(9, 'SF')).toBe('9 sq ft');
    expect(formatScopeQuantity(48, 'Linear Ft')).toBe('48 LF');
    expect(formatScopeQuantity(100, '% Complete (demo/manual)')).toBe('100 % complete (demo/manual)');
  });

  it('NEVER drops an unknown unit — it humanises the key instead', () => {
    expect(formatScopeQuantity(2, 'pallets')).toBe('2 pallets');
    expect(formatScopeQuantity(3, 'cubic_yards')).toBe('3 cu yd');
    expect(formatScopeQuantity(5, 'man_days')).toBe('5 man days');
  });

  it('keeps a zero target — 0 is data, and positiveNumber would have eaten it', () => {
    expect(formatScopeQuantity(0, 'holes')).toBe('0 holes');
  });

  it('falls back to the unit alone rather than printing nothing', () => {
    expect(formatScopeQuantity(null, 'holes')).toBe('holes');
    expect(formatScopeQuantity('n/a', 'pallets')).toBe('pallets');
  });

  it('returns empty when there is genuinely nothing to say', () => {
    expect(formatScopeQuantity(null, null)).toBe('');
    expect(formatScopeQuantity(undefined, '')).toBe('');
  });
});

describe('scopeItemDetail — the doubled Type/Description column', () => {
  it('drops the schedule form’s auto-generated echo', () => {
    // PROD, verbatim: these three shapes are 33 of the 39 rows in job_scope_items.
    expect(scopeItemDetail('Wall/Track Sawing', 'Wall/Track Sawing — linear ft')).toBe('');
    expect(scopeItemDetail('Electric Core Drilling', 'Electric Core Drilling — holes')).toBe('');
    expect(scopeItemDetail('Handheld / Push Sawing', 'Handheld / Push Sawing — % complete')).toBe('');
  });

  it('drops a description that is just the work type again', () => {
    expect(scopeItemDetail('Chain Sawing', 'Chain Sawing')).toBe('');
    expect(scopeItemDetail('Chain Sawing', '  chain sawing ')).toBe('');
  });

  it('KEEPS what a human actually typed, in full', () => {
    // PROD rows — the whole point of the column.
    expect(scopeItemDetail('Diesel Floor Sawing', 'Equipment trench 60ft x 3ft x 8in')).toBe(
      'Equipment trench 60ft x 3ft x 8in'
    );
    expect(scopeItemDetail('Electric Core Drilling', '12 conduit penetrations, 4in bit, 8in SOG')).toBe(
      '12 conduit penetrations, 4in bit, 8in SOG'
    );
  });

  it('keeps a note that merely STARTS with the work type', () => {
    expect(
      scopeItemDetail('Wall/Track Sawing', 'Wall/Track Sawing — two door openings, 10in wall')
    ).toBe('Wall/Track Sawing — two door openings, 10in wall');
  });

  it('handles a missing work type or description without throwing', () => {
    expect(scopeItemDetail('', 'Something')).toBe('Something');
    expect(scopeItemDetail('Chain Sawing', null)).toBe('');
    expect(scopeItemDetail(null, undefined)).toBe('');
  });
});

describe('formatScopeItems — the SERVICE ITEMS block on both tickets', () => {
  it('turns the founder’s printout into one resolved measure per row', () => {
    const rows = formatScopeItems([
      {
        id: 'a',
        work_type: 'Wall/Track Sawing',
        description: 'Wall/Track Sawing — linear ft',
        unit: 'linear_ft',
        target_quantity: 48,
      },
      {
        id: 'b',
        work_type: 'Handheld / Push Sawing',
        description: 'Handheld / Push Sawing — % complete',
        unit: 'percent',
        target_quantity: 100,
      },
    ]);
    expect(rows).toEqual([
      { key: 'a', service: 'Wall/Track Sawing', detail: '', quantity: '48 LF' },
      { key: 'b', service: 'Handheld / Push Sawing', detail: '', quantity: '100%' },
    ]);
  });

  it('carries a hand-written description through', () => {
    const rows = formatScopeItems([
      {
        id: 'c',
        work_type: 'Electric Core Drilling',
        description: '12 conduit penetrations, 4in bit, 8in SOG',
        unit: 'holes',
        target_quantity: 12,
      },
    ]);
    expect(rows[0]).toEqual({
      key: 'c',
      service: 'Electric Core Drilling',
      detail: '12 conduit penetrations, 4in bit, 8in SOG',
      quantity: '12 holes',
    });
  });

  it('falls back to the array index when a row has no id', () => {
    const rows = formatScopeItems([{ work_type: 'GPR Scanning', unit: 'percent', target_quantity: 100 }]);
    expect(rows[0].key).toBe('0');
  });

  it('drops only rows that would print as a blank line', () => {
    expect(formatScopeItems([{ work_type: '', description: '', unit: '', target_quantity: null }])).toEqual([]);
    // …but a row with nothing BUT a service name still prints.
    expect(formatScopeItems([{ work_type: 'Other' }])).toEqual([
      { key: '0', service: 'Other', detail: '', quantity: '' },
    ]);
  });

  it('tolerates junk instead of an array', () => {
    expect(formatScopeItems(null)).toEqual([]);
    expect(formatScopeItems(undefined)).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatScopeItems([null as any, 'x' as any])).toEqual([]);
  });
});

describe('ppeLabel / formatPpeAndSafety', () => {
  it('spells out the glove cut level', () => {
    expect(ppeLabel('gloves_cut_3')).toBe('Gloves Cut Level 3');
    expect(ppeLabel('gloves_cut_5')).toBe('Gloves Cut Level 5');
  });

  it('title-cases a storage token', () => {
    expect(ppeLabel('hard_hat')).toBe('Hard Hat');
    expect(ppeLabel('face_shield')).toBe('Face Shield');
    expect(ppeLabel('vest')).toBe('Vest');
  });

  it('leaves free text a human typed alone', () => {
    expect(ppeLabel('FR clothing required in Bay 4')).toBe('FR clothing required in Bay 4');
  });

  it('merges PPE and additional safety, dropping blanks', () => {
    expect(formatPpeAndSafety(['hard_hat', '', null], ['gloves_cut_3'])).toEqual([
      'Hard Hat',
      'Gloves Cut Level 3',
    ]);
    expect(formatPpeAndSafety(null, undefined)).toEqual([]);
  });
});

describe('scopeItemsHaveDetail — one decision, both tickets', () => {
  it('is false for the all-auto-generated job (33 of 39 production rows)', () => {
    const rows = formatScopeItems([
      { work_type: 'Wall/Track Sawing', description: 'Wall/Track Sawing — linear ft', unit: 'linear_ft', target_quantity: 48 },
      { work_type: 'GPR Scanning', description: 'GPR Scanning — % complete', unit: 'percent', target_quantity: 100 },
    ]);
    expect(scopeItemsHaveDetail(rows)).toBe(false);
  });

  it('is true as soon as one row carries a typed note', () => {
    const rows = formatScopeItems([
      { work_type: 'Wall/Track Sawing', description: 'Wall/Track Sawing — linear ft', unit: 'linear_ft', target_quantity: 48 },
      { work_type: 'Diesel Floor Sawing', description: 'Equipment trench 60ft x 3ft x 8in', unit: 'linear_ft', target_quantity: 60 },
    ]);
    expect(scopeItemsHaveDetail(rows)).toBe(true);
  });

  it('is false for no rows at all', () => {
    expect(scopeItemsHaveDetail([])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-CUT SPACING — the instruction for HOW to cut (guardian, Aug 17 2026)
//
// Every fixture below is a LITERAL production row. The office writes
// `cross_cut_lengthwise_ft` / `cross_cut_widthwise_ft` / `overcut_allowed` into
// the same objects as the dimensions, and nothing printed them: 9 of 48 job
// orders carry spacing, 7 still active, one (`JOB-2026-793440`) in_progress on
// the day this was found. Its Service Items target of 182 LF is only reachable
// WITH the 2 ft grid (124 ft perimeter + 29 interior cuts × 2 ft), so the sheet
// printed a number that presupposed an instruction it never stated.
// ─────────────────────────────────────────────────────────────────────────────

describe('cross-cut spacing on cut rows', () => {
  it('PROD JOB-2026-793440 (in_progress): states the 2ft × 2ft grid the 182 LF depends on', () => {
    const s = formatScopeCuts(
      '[{"length":"60","width":"2","depth":"6","cross_cut_lengthwise_ft":"2","cross_cut_widthwise_ft":"2","overcut_allowed":true}]'
    );
    expect(s!.text).toBe('1 cut — 60\' × 2\' @ 6" deep (cross-cut every 2\' × 2\')');
  });

  it('PROD JOB-2026-815303: 100ft lengthwise / 10ft widthwise on a 100 × 11.5 slab', () => {
    const s = formatScopeCuts(
      '[{"length":"100","width":"11.5","depth":"10","cross_cut_lengthwise_ft":"100","cross_cut_widthwise_ft":"10"},{"length":"","width":"","depth":""}]'
    );
    // The second production row is entirely blank and must still be dropped.
    expect(s!.text).toBe('1 cut — 100\' × 11.5\' @ 10" deep (cross-cut every 100\' × 10\')');
  });

  it('PROD JOB-2026-895358: overcut:false with NO spacing prints the constraint alone', () => {
    const s = formatScopeCuts('[{"length":"5","width":"5","depth":"7-10","overcut_allowed":false}]');
    // `7-10` is not a number, so no depth is invented — but the billing-relevant
    // overcut constraint still reaches paper.
    expect(s!.text).toBe("1 cut — 5' × 5' (no overcut)");
  });

  it('PROD JOB-2026-384218: a row with no dimensions at all stays dropped', () => {
    // overcut_allowed alone is not a cut. Resurrecting this row would print an
    // empty ruled line that says nothing.
    expect(formatScopeCuts('[{"length":"","width":"","depth":"","overcut_allowed":false}]')).toBeNull();
  });

  it('PROD JOB-2026-859542: an all-zero cut row is still dropped, not printed as 0', () => {
    expect(formatScopeCuts('[{"length":"0","width":"0","depth":"0"}]')).toBeNull();
  });
});

describe('cross-cut spacing on area rows', () => {
  it('PROD JOB-2026-400368: four rows, each carrying its own 5ft × 5ft grid', () => {
    const s = formatScopeAreas(
      '[{"length":"30","width":"21","thickness":"6","qty":"","cross_cut_lengthwise_ft":"5","cross_cut_widthwise_ft":"5"},' +
        '{"length":"17","width":"5","thickness":"6","qty":"","cross_cut_lengthwise_ft":"5","cross_cut_widthwise_ft":"5"},' +
        '{"length":"44","width":"11","thickness":"6","qty":"","cross_cut_lengthwise_ft":"5","cross_cut_widthwise_ft":"5"},' +
        '{"length":"40","width":"9.5","thickness":"6","qty":"2","cross_cut_lengthwise_ft":"5","cross_cut_widthwise_ft":"5"}]'
    );
    expect(s!.areaCount).toBe(5);
    // Bracketed, NOT comma-appended: the rows themselves are joined with ', ',
    // so a comma-led clause would read as the start of the next area.
    expect(s!.text).toBe(
      '5 areas — 30\' × 21\' × 6" thick (cross-cut every 5\' × 5\'), ' +
        '17\' × 5\' × 6" thick (cross-cut every 5\' × 5\'), ' +
        '44\' × 11\' × 6" thick (cross-cut every 5\' × 5\'), ' +
        '2 × 40\' × 9.5\' × 6" thick (cross-cut every 5\' × 5\') = 1,959 sq ft total'
    );
  });

  it('PROD JOB-2026-914932: a leading-dot decimal renders as 0.25, never NaN', () => {
    const s = formatScopeAreas(
      '[{"length":"3","width":"3","thickness":"8","qty":"2","cross_cut_lengthwise_ft":"3","cross_cut_widthwise_ft":"3"},' +
        '{"length":"3","width":"3","thickness":"18","qty":"","cross_cut_lengthwise_ft":".25","cross_cut_widthwise_ft":"3"}]'
    );
    expect(s!.text).toContain("(cross-cut every 0.25' × 3')");
    expect(s!.text).not.toMatch(/NaN/);
  });

  it('PROD JOB-2026-859542: mixed grids including a .67 fraction, plus a row with none', () => {
    const s = formatScopeAreas(
      '[{"length":"40","width":"28","thickness":"12","qty":"","cross_cut_lengthwise_ft":"4","cross_cut_widthwise_ft":"4"},' +
        '{"length":"8","width":"2","thickness":"12","qty":"2","cross_cut_lengthwise_ft":"4","cross_cut_widthwise_ft":"2"},' +
        '{"length":"12","width":".67","thickness":"12","qty":"","cross_cut_lengthwise_ft":"6","cross_cut_widthwise_ft":".67"},' +
        '{"length":"4","width":"4","thickness":"unknown","qty":"3"}]'
    );
    expect(s!.text).toContain('40\' × 28\' × 12" thick (cross-cut every 4\' × 4\')');
    // The qty prefix stays OUTSIDE: two identical areas, each cross-cut 4 × 2.
    expect(s!.text).toContain('2 × 8\' × 2\' × 12" thick (cross-cut every 4\' × 2\')');
    expect(s!.text).toContain('12\' × 0.67\' × 12" thick (cross-cut every 6\' × 0.67\')');
    // The last row carries no spacing at all — no dangling bracket, no comma.
    expect(s!.text).toContain("3 × 4' × 4' =");
  });

  it('PROD JOB-2026-499921: overcut TRUE stays silent (it is the default)', () => {
    const s = formatScopeAreas(
      '[{"length":"3","width":"1","thickness":"6","qty":"2","cross_cut_lengthwise_ft":"1","cross_cut_widthwise_ft":"1","overcut_allowed":true}]'
    );
    expect(s!.text).toBe(
      '2 areas — 3\' × 1\' × 6" thick (cross-cut every 1\' × 1\') = 6 sq ft total'
    );
  });

  it('PROD TEST-2026-000103: overcut FALSE is billing-relevant and prints', () => {
    const s = formatScopeAreas(
      '[{"length":"10","width":"10","thickness":"10","qty":"1","overcut_allowed":false,"cross_cut_lengthwise_ft":"5","cross_cut_widthwise_ft":"5"}]'
    );
    expect(s!.text).toBe(
      '1 area — 10\' × 10\' × 10" thick (cross-cut every 5\' × 5\', no overcut) = 100 sq ft total'
    );
  });
});

describe('crossCutText — the edge cases that must never reach paper wrong', () => {
  it('prints nothing at all when neither dimension was recorded', () => {
    expect(crossCutText(parseCrossCut({ length: '10' }))).toBe('');
    expect(crossCutText(parseCrossCut({}))).toBe('');
  });

  it('never prints a zero or an empty-string spacing', () => {
    expect(crossCutText(parseCrossCut({ cross_cut_lengthwise_ft: '0', cross_cut_widthwise_ft: '0' }))).toBe('');
    expect(crossCutText(parseCrossCut({ cross_cut_lengthwise_ft: '', cross_cut_widthwise_ft: '' }))).toBe('');
    expect(crossCutText(parseCrossCut({ cross_cut_lengthwise_ft: 0, cross_cut_widthwise_ft: 0 }))).toBe('');
    // One real, one zero → the real one still has to reach the crew.
    expect(crossCutText(parseCrossCut({ cross_cut_lengthwise_ft: '2', cross_cut_widthwise_ft: '0' }))).toBe(
      " (cross-cut every 2' lengthwise)"
    );
  });

  it('says WHICH way when only one side was entered', () => {
    expect(crossCutText(parseCrossCut({ cross_cut_lengthwise_ft: '100' }))).toBe(
      " (cross-cut every 100' lengthwise)"
    );
    expect(crossCutText(parseCrossCut({ cross_cut_widthwise_ft: '10' }))).toBe(
      " (cross-cut every 10' widthwise)"
    );
  });

  it('carries the overcut constraint with or without spacing', () => {
    expect(crossCutText(parseCrossCut({ overcut_allowed: false }))).toBe(' (no overcut)');
    expect(crossCutText(parseCrossCut({ overcut_allowed: true }))).toBe('');
    expect(crossCutText(parseCrossCut({ overcut_allowed: 'false', cross_cut_lengthwise_ft: '2' }))).toBe(
      " (cross-cut every 2' lengthwise, no overcut)"
    );
  });

  it('ignores junk rather than inventing a number', () => {
    expect(crossCutText(parseCrossCut({ cross_cut_lengthwise_ft: 'abc' }))).toBe('');
    expect(crossCutText(parseCrossCut({ cross_cut_lengthwise_ft: '-3' }))).toBe('');
    expect(crossCutText(parseCrossCut(null))).toBe('');
    expect(crossCutText(parseCrossCut('nope'))).toBe('');
  });
});

describe('booleanish — recorded-no vs never-recorded', () => {
  it('separates false from absent', () => {
    expect(booleanish(false)).toBe(false);
    expect(booleanish('false')).toBe(false);
    expect(booleanish('no')).toBe(false);
    expect(booleanish(true)).toBe(true);
    expect(booleanish('yes')).toBe(true);
    expect(booleanish(undefined)).toBeNull();
    expect(booleanish(null)).toBeNull();
    expect(booleanish('')).toBeNull();
    expect(booleanish('maybe')).toBeNull();
  });
});

describe('formatJobsiteConditions — the explicit NO on supply conditions', () => {
  it('prints Water: NO / Power: NO when the office recorded false (20 production jobs)', () => {
    expect(
      formatJobsiteConditions({ water_available: false, electricity_available: false })
    ).toEqual(['Water: NO', 'Power: NO']);
  });

  it('says nothing when the keys were never recorded', () => {
    // "not recorded" is not "no" — the old fixed checkbox list could not tell
    // them apart either way, but inventing a NO is worse than omitting one.
    expect(formatJobsiteConditions({ high_work: true })).toEqual(['High work']);
    expect(formatJobsiteConditions({})).toEqual([]);
  });

  it('still prints the positive form, with its distance', () => {
    expect(
      formatJobsiteConditions({ water_available: true, electricity_available: true, electricity_distance_ft: 75 })
    ).toEqual(['Water available', 'Power available — 75 ft']);
  });

  it('does NOT turn every other off condition into a NO chip', () => {
    // A hard one-page budget: only the two SUPPLY conditions the crew loads
    // equipment for get the explicit negative.
    expect(
      formatJobsiteConditions({
        water_available: false,
        plastic_needed: false,
        clean_up_required: false,
        high_work: false,
        proper_ventilation: false,
      })
    ).toEqual(['Water: NO']);
  });

  it('mixes one recorded NO with one recorded YES', () => {
    expect(formatJobsiteConditions({ water_available: false, electricity_available: true })).toEqual([
      'Water: NO',
      'Power available',
    ]);
  });
});

describe('formatPermits — the permit TYPE, on both sheets', () => {
  it('PROD JOB-2026-914932: names both permits, including HOT WORK', () => {
    expect(
      formatPermits([
        { type: 'hot_work', details: '' },
        { type: 'work_permit', details: '' },
      ])
    ).toEqual(['Hot Work Permit', 'Work Permit']);
  });

  it('appends free-text details when they say something the label does not', () => {
    expect(formatPermits([{ type: 'excavation', details: 'city of Greenville #4412' }])).toEqual([
      'Excavation Permit (city of Greenville #4412)',
    ]);
  });

  it('never drops an unknown type, and never prints "Other (Other)"', () => {
    expect(formatPermits([{ type: 'night_work', details: '' }])).toEqual(['Night work']);
    expect(formatPermits([{ type: 'other', details: 'roof access' }])).toEqual(['roof access']);
    expect(formatPermits([{ type: '', details: '' }])).toEqual(['Other']);
  });

  it('returns nothing for a missing or malformed array', () => {
    expect(formatPermits(null)).toEqual([]);
    expect(formatPermits([])).toEqual([]);
    expect(formatPermits('hot_work')).toEqual([]);
    expect(formatPermits([null, 'x'])).toEqual([]);
  });
});

describe('formatScopeQuantity — the unit alone, with no number', () => {
  it('names the unit rather than printing a dash', () => {
    expect(formatScopeQuantity(null, 'holes')).toBe('holes');
    expect(formatScopeQuantity(null, 'linear_ft')).toBe('LF');
    expect(formatScopeQuantity(null, 'percent')).toBe('%');
    expect(formatScopeQuantity(null, 'hours')).toBe('hrs');
    expect(formatScopeQuantity(null, 'pallets')).toBe('pallets');
    expect(formatScopeQuantity(null, null)).toBe('');
  });
});

// ── The two scope-entry changes of Aug 17 2026 ──────────────────────────────
//
// 1. "For linear ft, if they only added 1 area then make number of cuts 1
//    because it's just inputting linear ft."
// 2. "For the GPR, instead of getting sqft that they did, they don't have to do
//    that — we bill that by the hour, so they can just input hours onsite."
//
// Both are about what the office is ASKED for. Everything already stored has to
// keep printing exactly as it did, which is what the legacy cases below pin.

describe('one linear-feet row is one cut', () => {
  it('a single row with no count stored still prints as 1 cut', () => {
    // The shape the schedule form wrote for every job before it started
    // stamping the count — JOB-2026-288227 (in_progress) is literally this.
    const s = formatScopeCuts('[{"length":"","width":"","depth":"7","linear_feet":"316"}]');
    expect(s!.cutCount).toBe(1);
    expect(s!.text).toBe('1 cut — 316 LF @ 7" deep = 316 LF total');
  });

  it('the stamped count says the same thing', () => {
    const stamped = formatScopeCuts('[{"depth":"7","linear_feet":"316","num_cuts":"1"}]');
    const unstamped = formatScopeCuts('[{"depth":"7","linear_feet":"316"}]');
    expect(stamped!.text).toBe(unstamped!.text);
    expect(stamped!.cutCount).toBe(1);
  });

  it('several rows each count for themselves, and a per-row count is honoured', () => {
    // With more than one row the office gets the field back, because the count
    // genuinely varies: four identical 20 ft cuts plus one 60 ft cut.
    const s = formatScopeCuts([
      { linear_feet: '20', depth: '6', num_cuts: '4' },
      { linear_feet: '60', depth: '6', num_cuts: '1' },
    ]);
    expect(s!.cutCount).toBe(5);
    // The COUNT never multiplies the footage — 20 LF entered is 20 LF billed.
    expect(s!.totalLinearFeet).toBe(80);
    expect(s!.text).toBe('5 cuts — 20 LF @ 6" deep, 60 LF @ 6" deep = 80 LF total');
  });

  it('a multi-row job with counts missing falls back to one per row', () => {
    const s = formatScopeCuts([{ linear_feet: '20' }, { linear_feet: '60' }]);
    expect(s!.cutCount).toBe(2);
    expect(s!.totalLinearFeet).toBe(80);
  });

  it('LEGACY: a stored count other than 1 on a single row is never overridden', () => {
    // DEMO-2026-000002 (cancelled) carries exactly this: one row, num_cuts "3".
    const s = formatScopeCuts('[{"linear_feet":"100","depth":"8","num_cuts":"3","overcut_allowed":true}]');
    expect(s!.cutCount).toBe(3);
    expect(s!.totalLinearFeet).toBe(100);
  });

  it('an empty row is still not a cut', () => {
    expect(formatScopeCuts('[{"length":"","width":"","depth":"","num_cuts":"1"}]')).toBeNull();
  });
});

describe('GPR is billed by the hour', () => {
  it('the new shape prints hours on site, labelled', () => {
    const s = formatScopeSection('GPR', { hours_on_site: '4' });
    expect(s!.label).toBe('GPR Scanning');
    expect(s!.lines).toEqual(['Hours on site: 4 hrs']);
  });

  it('a fractional figure survives', () => {
    expect(formatScopeSection('GPR', { hours_on_site: '2.5' })!.lines).toEqual([
      'Hours on site: 2.5 hrs',
    ]);
  });

  it('the SERVICE ITEMS row reads as hours, not as a raw storage key', () => {
    const [row] = formatScopeItems([
      { id: 'g1', work_type: 'GPR Scanning', unit: 'hours', target_quantity: 4, description: 'GPR Scanning — hours' },
    ]);
    expect(row.quantity).toBe('4 hrs');
    expect(row.service).toBe('GPR Scanning');
    // The auto-generated description is an echo of the work type; it is stripped.
    expect(row.detail).toBe('');
    expect(formatScopeQuantity(1, 'hours')).toBe('1 hr');
  });

  it('LEGACY: a GPR scope stored as areas + scans still prints, and never blank', () => {
    // No production job carries a GPR scope entry (verified Aug 17 2026), but
    // the Aug-15 form could have written this shape, and a job saved with it
    // must not render as an empty heading or NaN after the change.
    const s = formatScopeSection('GPR', {
      areas: '[{"length":"20","width":"10","qty":"2"}]',
      num_scans: '3',
    });
    expect(s!.lines).toEqual([
      "2 areas — 20' × 10' = 400 sq ft total",
      'Scans: 3',
    ]);
    expect(s!.lines.join(' ')).not.toContain('NaN');
  });

  it('LEGACY: the even older single square-foot box still prints', () => {
    const s = formatScopeSection('GPR', { area_sqft: '1200' });
    // Verbatim — the leftover-field loop prints what was stored, it does not
    // re-format a number the office typed.
    expect(s!.lines).toEqual(['Area: 1200 sq ft']);
  });

  it('a GPR entry with nothing filled in is still dropped, not printed empty', () => {
    expect(formatScopeSection('GPR', { hours_on_site: '' })).toBeNull();
    expect(formatScopeSection('GPR', {})).toBeNull();
  });
});
