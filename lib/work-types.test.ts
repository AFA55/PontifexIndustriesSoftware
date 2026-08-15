import {
  ALL_WORK_TYPES,
  buildWorkItemFromEntry,
  emptyAreaRow,
  emptyCutRow,
  emptyHoleRow,
  emptyWorkEntry,
  entryHasMeasurements,
  removalFromWorkItems,
  resolveRecommendedWorkTypes,
  resolveScopeCodes,
  totalLinearFeet,
  workEntryFromWorkItem,
  workEntryMode,
  type CoreDrillingDetails,
  type DemolitionDetails,
  type GeneralDetails,
  type MaterialRemoval,
  type SawingDetails,
  type WorkEntry,
} from './work-types';
import { workItemDetailLine, summarizeWorkItem } from './work-items-format';

// ── Which builder a work type gets ──────────────────────────────────────────
describe('workEntryMode', () => {
  it('sends core drilling to the holes builder', () => {
    expect(workEntryMode('CORE DRILL')).toBe('holes');
    expect(workEntryMode('HYDRAULIC CORE DRILL')).toBe('holes');
  });

  it('sends saws to the sawing builder, and never confuses a core drill for one', () => {
    expect(workEntryMode('SLAB SAW')).toBe('sawing');
    expect(workEntryMode('WALL SAW')).toBe('sawing');
    expect(workEntryMode('CHAIN SAW')).toBe('sawing');
    expect(workEntryMode('CORE DRILL')).not.toBe('sawing');
  });

  it('sends breaking / hammering / chipping / Brokk to the areas builder', () => {
    expect(workEntryMode('BREAK & REMOVE')).toBe('demo');
    expect(workEntryMode('DEMOLITION')).toBe('demo');
    expect(workEntryMode('REMOVAL')).toBe('demo');
    expect(workEntryMode('JACK HAMMERING')).toBe('demo');
    expect(workEntryMode('CHIPPING')).toBe('demo');
    expect(workEntryMode('BROKK')).toBe('demo');
  });

  it('leaves EXCAVATE DIRT generic — unchanged from before the rebuild', () => {
    expect(workEntryMode('EXCAVATE DIRT')).toBe('generic');
    expect(workEntryMode('GRINDING')).toBe('generic');
    expect(workEntryMode('STANDBY TIME')).toBe('generic');
  });

  it('handles a type the operator typed themselves', () => {
    expect(workEntryMode('epoxy removal')).toBe('demo'); // contains "removal"
    expect(workEntryMode('SOMETHING NEW')).toBe('generic');
  });
});

// ── Recommended types: what the office actually scoped ──────────────────────
describe('resolveScopeCodes', () => {
  it('reads the scope_details keys the office wrote', () => {
    expect(
      resolveScopeCodes({ scopeDetails: { ECD: { holes: '[]' }, EFS: { cuts: '[]' } } })
    ).toEqual(['ECD', 'EFS']);
  });

  it('drops the schedule form’s synthetic keys', () => {
    expect(resolveScopeCodes({ scopeDetails: { _removal: {}, HCD: {} } })).toEqual(['HCD']);
  });

  it('maps job_scope_items labels back to codes', () => {
    expect(
      resolveScopeCodes({ scopeItems: [{ work_type: 'Hydraulic Core Drilling' }, { work_type: 'Electric Floor Sawing' }] })
    ).toEqual(['HCD', 'EFS']);
  });

  it('falls back to the legacy job_type CSV', () => {
    expect(resolveScopeCodes({ jobType: 'ECD, WS/TS ,Demo' })).toEqual(['ECD', 'WS/TS', 'Demo']);
  });

  it('dedupes across all three sources, scope_details first', () => {
    expect(
      resolveScopeCodes({
        scopeDetails: { EFS: {} },
        scopeItems: [{ work_type: 'Electric Floor Sawing' }],
        jobType: 'EFS,ECD',
      })
    ).toEqual(['EFS', 'ECD']);
  });

  it('survives null / missing everything', () => {
    expect(resolveScopeCodes({})).toEqual([]);
    expect(resolveScopeCodes({ scopeDetails: null, scopeItems: null, jobType: null })).toEqual([]);
  });
});

describe('resolveRecommendedWorkTypes', () => {
  it('leads with the work types the office sent the crew to do', () => {
    // The founder's own example: core drilling + electric floor sawing +
    // hydraulic core drilling.
    expect(
      resolveRecommendedWorkTypes({ scopeDetails: { ECD: {}, EFS: {}, HCD: {} } })
    ).toEqual(['CORE DRILL', 'ELECTRIC SLAB SAW', 'HYDRAULIC CORE DRILL']);
  });

  it('expands a multi-service code', () => {
    expect(resolveRecommendedWorkTypes({ jobType: 'WS/TS' })).toEqual(['WALL SAW', 'SLAB SAW']);
  });

  it('never recommends a name the picker cannot build a measurement for', () => {
    const names = resolveRecommendedWorkTypes({ jobType: 'ECD,HFCD,HCD,DFS,EFS,WS/TS,CS,HHS/PS,WireSaw,GPR,Demo,Brokk' });
    for (const name of names) expect(ALL_WORK_TYPES).toContain(name);
  });

  it('contributes nothing for an unknown or empty code', () => {
    expect(resolveRecommendedWorkTypes({ jobType: 'Other,,ZZZ' })).toEqual([]);
  });

  it('does not repeat a type two codes both imply', () => {
    // DFS and TS both mean the slab saw.
    expect(resolveRecommendedWorkTypes({ jobType: 'DFS,TS' })).toEqual(['SLAB SAW']);
  });
});

// ── The submit gate ─────────────────────────────────────────────────────────
describe('entryHasMeasurements', () => {
  it('is false for a type that was only ticked', () => {
    expect(entryHasMeasurements(emptyWorkEntry('CORE DRILL'))).toBe(false);
    expect(entryHasMeasurements(emptyWorkEntry('SLAB SAW'))).toBe(false);
    expect(entryHasMeasurements(emptyWorkEntry('BREAK & REMOVE'))).toBe(false);
    expect(entryHasMeasurements(emptyWorkEntry('GRINDING'))).toBe(false);
  });

  it('is true once a hole size or depth is typed', () => {
    const e = emptyWorkEntry('CORE DRILL');
    e.holes = [{ ...emptyHoleRow(), bitSize: '4' }];
    expect(entryHasMeasurements(e)).toBe(true);
  });

  it('is true once linear feet are typed', () => {
    const e = emptyWorkEntry('SLAB SAW');
    e.cuts = [{ linearFeet: '120', cutDepth: '6' }];
    expect(entryHasMeasurements(e)).toBe(true);
  });

  it('needs both length and width in areas mode', () => {
    const e = emptyWorkEntry('SLAB SAW');
    e.sawMode = 'areas';
    e.areas = [{ ...emptyAreaRow(), length: '10' }];
    expect(entryHasMeasurements(e)).toBe(false);
    e.areas = [{ ...emptyAreaRow(), length: '10', width: '9' }];
    expect(entryHasMeasurements(e)).toBe(true);
  });

  it('needs a quantity for a generic type', () => {
    const e = emptyWorkEntry('GRINDING');
    e.quantity = '400';
    expect(entryHasMeasurements(e)).toBe(true);
  });
});

// ── The stored shape — this is the contract with work-items-format ──────────
describe('buildWorkItemFromEntry — core drilling', () => {
  const entry = (): WorkEntry => {
    const e = emptyWorkEntry('CORE DRILL');
    e.holes = [
      { quantity: '2', bitSize: '4', depthInches: '10', plasticSetup: false },
      { quantity: '1', bitSize: '6', depthInches: '12', plasticSetup: true },
    ];
    e.rebarSize = '#4';
    return e;
  };

  it('stores every hole under details.holes and totals the quantity', () => {
    const item = buildWorkItemFromEntry(entry());
    const details = item.details as CoreDrillingDetails;
    expect(details.holes).toHaveLength(2);
    expect(details.holes[0]).toMatchObject({ bitSize: '4', depthInches: 10, quantity: 2 });
    expect(item.quantity).toBe(3);
  });

  it('writes the legacy rebar mirrors so old readers keep working', () => {
    const details = buildWorkItemFromEntry(entry()).details as CoreDrillingDetails;
    expect(details.holes[0].rebarSize).toBe('#4');
    expect(details.holes[0].cutSteel).toBe(true);
    expect(details.holes[0].steelEncountered).toBe('#4 rebar');
  });

  it('renders through the shared formatter, unchanged', () => {
    const item = buildWorkItemFromEntry(entry());
    expect(workItemDetailLine({ ...item, details_json: item.details })).toBe(
      '2× 4" @ 10" rebar #4, 1× 6" @ 12" rebar #4'
    );
  });

  it('drops rows the operator left blank, and counts a sized row with no count as one hole', () => {
    const e = emptyWorkEntry('CORE DRILL');
    e.holes = [{ quantity: '', bitSize: '4', depthInches: '10', plasticSetup: false }, emptyHoleRow()];
    const item = buildWorkItemFromEntry(e);
    expect((item.details as CoreDrillingDetails).holes).toHaveLength(1);
    expect(item.quantity).toBe(1);
  });
});

describe('buildWorkItemFromEntry — sawing', () => {
  it('linear mode stores linear feet + cut depth and nothing else', () => {
    const e = emptyWorkEntry('SLAB SAW');
    e.cuts = [
      { linearFeet: '120', cutDepth: '6' },
      { linearFeet: '30', cutDepth: '4' },
    ];
    const item = buildWorkItemFromEntry(e);
    const details = item.details as SawingDetails;
    expect(details.cuts).toHaveLength(2);
    expect(details.cuts[0]).toMatchObject({ inputMode: 'linear', linearFeet: 120, cutDepth: 6 });
    // No width, no cross-cuts — linear mode is one number (commit 706d8c15).
    expect(details.cuts[0].areas).toEqual([]);
    expect(item.quantity).toBe(150);
    expect(workItemDetailLine({ ...item, details_json: item.details })).toBe(
      '120 LF @ 6", 30 LF @ 4" (wet)'
    );
  });

  it('areas mode keeps the rectangles AND computes the linear feet from them', () => {
    const e = emptyWorkEntry('SLAB SAW');
    e.sawMode = 'areas';
    e.areas = [{ length: '10', width: '9', thickness: '6', quantity: '1' }];
    const item = buildWorkItemFromEntry(e);
    const details = item.details as SawingDetails;
    expect(details.cuts).toHaveLength(1);
    expect(details.cuts[0].inputMode).toBe('area');
    // Perimeter 2(10+9) = 38 — the operator page's long-standing math.
    expect(details.cuts[0].linearFeet).toBe(38);
    expect(details.cuts[0].cutDepth).toBe(6);
    expect(details.cuts[0].areas).toHaveLength(1);
    // The founder's Aug-12 complaint was the SIZES going missing off the sheet.
    expect(workItemDetailLine({ ...item, details_json: item.details })).toContain("10' × 9'");
  });

  it('multiplies an area by its quantity', () => {
    const e = emptyWorkEntry('WALL SAW');
    e.sawMode = 'areas';
    e.areas = [{ length: '10', width: '10', thickness: '8', quantity: '3' }];
    expect(totalLinearFeet(e)).toBe(120);
    expect(buildWorkItemFromEntry(e).quantity).toBe(120);
  });

  it('carries wet/dry through', () => {
    const e = emptyWorkEntry('HAND SAW');
    e.cutType = 'dry';
    e.cuts = [{ linearFeet: '20', cutDepth: '3' }];
    expect((buildWorkItemFromEntry(e).details as SawingDetails).cutType).toBe('dry');
  });
});

describe('buildWorkItemFromEntry — demolition', () => {
  it('stores a top-level areas[] with the square footage as the quantity', () => {
    const e = emptyWorkEntry('BREAK & REMOVE');
    e.areas = [{ length: '20', width: '10', thickness: '6', quantity: '' }];
    const item = buildWorkItemFromEntry(e);
    const details = item.details as DemolitionDetails;
    expect(details.areas).toEqual([{ length: 20, width: 10, depth: 6, quantity: 1 }]);
    expect(details.totalSquareFeet).toBe(200);
    expect(item.quantity).toBe(200);
    expect(workItemDetailLine({ ...item, details_json: item.details })).toBe(
      "200 sq ft (20' × 10' @ 6\")"
    );
  });

  it('does not collide with the sawing shape', () => {
    const demo = buildWorkItemFromEntry({ ...emptyWorkEntry('BROKK'), areas: [{ length: '4', width: '4', thickness: '8', quantity: '' }] });
    expect('cuts' in (demo.details as object)).toBe(false);
  });
});

describe('buildWorkItemFromEntry — generic', () => {
  it('keeps the unit, which is what makes the number mean anything', () => {
    const e = emptyWorkEntry('GRINDING');
    e.quantity = '400';
    const item = buildWorkItemFromEntry(e);
    expect(item.quantity).toBe(400);
    expect((item.details as GeneralDetails).unit).toBe('sq ft');
    expect(workItemDetailLine({ ...item, details_json: item.details })).toBe('400 sq ft');
  });

  it('defaults the unit off the work type', () => {
    expect(emptyWorkEntry('STANDBY TIME').unit).toBe('hours');
    expect(emptyWorkEntry('HAULING').unit).toBe('loads');
    expect(emptyWorkEntry('INSTALL BOLLARD(S)').unit).toBe('each');
  });
});

// ── Quick notes stay internal ───────────────────────────────────────────────
describe('quick notes', () => {
  it('lands on the item note (the work_items.notes column) and mirrors into details', () => {
    const e = emptyWorkEntry('SLAB SAW');
    e.cuts = [{ linearFeet: '50', cutDepth: '4' }];
    e.notes = '  waited on the GC to move a lift  ';
    const item = buildWorkItemFromEntry(e);
    expect(item.notes).toBe('waited on the GC to move a lift');
    expect((item.details as SawingDetails).notes).toBe('waited on the GC to move a lift');
  });

  it('an emptied box clears the note rather than keeping a stale one', () => {
    const e = emptyWorkEntry('SLAB SAW');
    e.cuts = [{ linearFeet: '50', cutDepth: '4' }];
    e.notes = '   ';
    expect(buildWorkItemFromEntry(e).notes).toBeUndefined();
  });

  it('is prose on the internal summary, never a measurement', () => {
    const e = emptyWorkEntry('SLAB SAW');
    e.cuts = [{ linearFeet: '50', cutDepth: '4' }];
    e.notes = 'tight access';
    const item = buildWorkItemFromEntry(e);
    expect(summarizeWorkItem({ work_type: item.name, quantity: item.quantity, notes: item.notes, details_json: item.details }))
      .toBe('SLAB SAW ×50 (50 LF @ 4" (wet)) — tight access');
  });
});

// ── Material removal ────────────────────────────────────────────────────────
describe('material removal', () => {
  const removal: MaterialRemoval = { removed: true, method: 'hand', equipment: ['Wheelbarrow'] };

  it('records hand removal — the option the founder asked for', () => {
    const e = emptyWorkEntry('BREAK & REMOVE');
    e.areas = [{ length: '10', width: '10', thickness: '4', quantity: '' }];
    const details = buildWorkItemFromEntry(e, removal).details as DemolitionDetails;
    expect(details.method).toBe('Hand Removal');
    expect(details.equipment).toBe('Wheelbarrow');
    expect(workItemDetailLine({ details_json: details })).toContain('Hand Removal: Wheelbarrow');
  });

  it('is stored structurally on every item, but never invents a measurement', () => {
    const e = emptyWorkEntry('CORE DRILL');
    e.holes = [{ quantity: '4', bitSize: '4', depthInches: '10', plasticSetup: false }];
    const item = buildWorkItemFromEntry(e, removal);
    expect((item.details as CoreDrillingDetails).materialRemoval).toEqual({
      removed: true,
      method: 'Hand Removal',
      equipment: ['Wheelbarrow'],
    });
    // The customer-facing detail line is measurements only.
    expect(workItemDetailLine({ ...item, details_json: item.details })).toBe('4× 4" @ 10"');
  });

  it('writes nothing at all when no material left the site', () => {
    const e = emptyWorkEntry('CORE DRILL');
    e.holes = [{ quantity: '1', bitSize: '4', depthInches: '10', plasticSetup: false }];
    const details = buildWorkItemFromEntry(e, { removed: false, method: '', equipment: [] }).details as CoreDrillingDetails;
    expect(details.materialRemoval).toBeUndefined();
  });

  it('reads back out of a submitted day', () => {
    const e = emptyWorkEntry('CORE DRILL');
    e.holes = [{ quantity: '1', bitSize: '4', depthInches: '10', plasticSetup: false }];
    const items = [buildWorkItemFromEntry(e, removal)];
    expect(removalFromWorkItems(items)).toEqual({ removed: true, method: 'hand', equipment: ['Wheelbarrow'] });
  });

  it('reads back as "nothing removed" from a day that had none', () => {
    expect(removalFromWorkItems([{ name: 'CORE DRILL', quantity: 1 }])).toEqual({
      removed: false,
      method: '',
      equipment: [],
    });
  });
});

// ── Round-trip: a restored draft must open, not evaporate ───────────────────
describe('workEntryFromWorkItem', () => {
  it('round-trips core drilling', () => {
    const before = emptyWorkEntry('CORE DRILL');
    before.holes = [{ quantity: '2', bitSize: '4', depthInches: '10', plasticSetup: true }];
    before.rebarSize = '#5';
    before.notes = 'poly set';
    const after = workEntryFromWorkItem(buildWorkItemFromEntry(before));
    expect(after.mode).toBe('holes');
    expect(after.holes).toEqual([{ quantity: '2', bitSize: '4', depthInches: '10', plasticSetup: true }]);
    expect(after.rebarSize).toBe('#5');
    expect(after.notes).toBe('poly set');
  });

  it('round-trips linear sawing', () => {
    const before = emptyWorkEntry('WALL SAW');
    before.cuts = [{ linearFeet: '120', cutDepth: '6' }];
    before.cutType = 'dry';
    const after = workEntryFromWorkItem(buildWorkItemFromEntry(before));
    expect(after.mode).toBe('sawing');
    expect(after.sawMode).toBe('linear');
    expect(after.cuts).toEqual([{ linearFeet: '120', cutDepth: '6' }]);
    expect(after.cutType).toBe('dry');
  });

  it('round-trips areas-mode sawing back into areas mode', () => {
    const before = emptyWorkEntry('SLAB SAW');
    before.sawMode = 'areas';
    before.areas = [{ length: '10', width: '9', thickness: '6', quantity: '2' }];
    const after = workEntryFromWorkItem(buildWorkItemFromEntry(before));
    expect(after.sawMode).toBe('areas');
    expect(after.areas[0]).toMatchObject({ length: '10', width: '9', thickness: '6', quantity: '2' });
  });

  it('round-trips demolition', () => {
    const before = emptyWorkEntry('JACK HAMMERING');
    before.areas = [{ length: '12', width: '8', thickness: '5', quantity: '' }];
    const after = workEntryFromWorkItem(buildWorkItemFromEntry(before));
    expect(after.mode).toBe('demo');
    expect(after.areas[0]).toMatchObject({ length: '12', width: '8', thickness: '5' });
  });

  it('round-trips a generic type with its unit', () => {
    const before = emptyWorkEntry('GRINDING');
    before.quantity = '400';
    const after = workEntryFromWorkItem(buildWorkItemFromEntry(before));
    expect(after.quantity).toBe('400');
    expect(after.unit).toBe('sq ft');
  });

  it('opens a ticked-but-empty item instead of throwing it away', () => {
    const after = workEntryFromWorkItem({ name: 'CORE DRILL', quantity: 0 });
    expect(after.mode).toBe('holes');
    expect(after.holes).toEqual([emptyHoleRow()]);
    expect(entryHasMeasurements(after)).toBe(false);
  });

  it('keeps the right builder for a type that was ticked and left empty', () => {
    // The autosaved draft of a ticked-but-unfilled type carries an EMPTY
    // container, not a missing one. Restoring it must not turn a core drill
    // into a "how much / unit" box.
    const drill = workEntryFromWorkItem(buildWorkItemFromEntry(emptyWorkEntry('CORE DRILL')));
    expect(drill.mode).toBe('holes');
    expect(drill.holes).toEqual([emptyHoleRow()]);

    const saw = workEntryFromWorkItem(buildWorkItemFromEntry(emptyWorkEntry('SLAB SAW')));
    expect(saw.mode).toBe('sawing');
    expect(saw.cuts).toEqual([emptyCutRow()]);

    const demo = workEntryFromWorkItem(buildWorkItemFromEntry(emptyWorkEntry('BREAK & REMOVE')));
    expect(demo.mode).toBe('demo');
    expect(demo.areas).toEqual([emptyAreaRow()]);
  });

  it('opens a PRE-REBUILD row written by the old screen', () => {
    // The old page wrote a chainsaw cut with blades + overcut flags; none of
    // that is asked for any more, but the numbers must still come back.
    const legacy = {
      name: 'CHAIN SAW',
      quantity: 42,
      details: {
        cuts: [
          {
            inputMode: 'linear',
            linearFeet: 42,
            cutDepth: 12,
            areas: [],
            bladesUsed: ['14"'],
            overcut: true,
            chainsawed: true,
            rebarSize: '#4',
            cutSteel: true,
            steelEncountered: '#4 rebar',
          },
        ],
        cutType: 'wet',
        notes: 'legacy note',
      },
    } as never;
    const after = workEntryFromWorkItem(legacy);
    expect(after.cuts).toEqual([{ linearFeet: '42', cutDepth: '12' }]);
    expect(after.rebarSize).toBe('#4');
    expect(after.notes).toBe('legacy note');
  });

  it('opens a row with no details at all', () => {
    const after = workEntryFromWorkItem({ name: 'STANDBY TIME', quantity: 2 });
    expect(after.mode).toBe('generic');
    expect(after.quantity).toBe('2');
  });
});

describe('emptyWorkEntry', () => {
  it('opens each builder with exactly one blank row to type into', () => {
    expect(emptyWorkEntry('CORE DRILL').holes).toEqual([emptyHoleRow()]);
    expect(emptyWorkEntry('SLAB SAW').cuts).toEqual([emptyCutRow()]);
    expect(emptyWorkEntry('BREAK & REMOVE').areas).toEqual([emptyAreaRow()]);
    expect(emptyWorkEntry('GRINDING').holes).toEqual([]);
  });
});

// ── Regressions the guardian review caught before this reached a crew ────────
describe('billing round-trips that used to lose money', () => {
  const roundTrip = (entry: any) => workEntryFromWorkItem(buildWorkItemFromEntry(entry) as any);

  it('B1 — five 10x10 demo pads stay 500 sq ft through a resubmit', () => {
    const entry: any = {
      ...emptyWorkEntry('BREAK & REMOVE'),
      areas: [{ length: '10', width: '10', thickness: '6', quantity: '5' }],
    };
    const first = buildWorkItemFromEntry(entry) as any;
    expect(first.quantity).toBe(500);

    // Open day-complete, press Back, submit again.
    const second = buildWorkItemFromEntry(roundTrip(entry) as any) as any;
    expect(second.quantity).toBe(500);
  });

  it('B1 — the stored area carries the quantity the total was computed from', () => {
    const item = buildWorkItemFromEntry({
      ...emptyWorkEntry('BREAK & REMOVE'),
      areas: [{ length: '10', width: '10', thickness: '6', quantity: '5' }],
    } as any) as any;
    expect(item.details.areas[0].quantity).toBe(5);
  });

  it('B1 — a legacy area with no quantity still round-trips to the same total', () => {
    const legacy: any = {
      name: 'BREAK & REMOVE',
      quantity: 100,
      details: { areas: [{ length: 10, width: 10, depth: 6 }], totalSquareFeet: 100 },
    };
    expect((buildWorkItemFromEntry(workEntryFromWorkItem(legacy)) as any).quantity).toBe(100);
  });

  it('B2 — a saw item holding BOTH linear and area cuts keeps its linear feet', () => {
    // 120 LF linear + one 10x9 area (perimeter 38) = 158 LF. This shape exists
    // in production: the old page stored a cuts array, one inputMode per cut.
    const legacy: any = {
      name: 'WALL SAW',
      quantity: 158,
      details: {
        cutType: 'wet',
        cuts: [
          { inputMode: 'linear', linearFeet: 120, cutDepth: 6, areas: [] },
          {
            inputMode: 'area',
            linearFeet: 38,
            cutDepth: 6,
            areas: [{ length: 10, width: 9, depth: 6, quantity: 1 }],
          },
        ],
      },
    };
    const again = buildWorkItemFromEntry(workEntryFromWorkItem(legacy)) as any;
    expect(again.quantity).toBe(158);
  });

  it('H1 — areas typed then toggled to linear are still saved', () => {
    const entry: any = {
      ...emptyWorkEntry('SLAB SAW'),
      sawMode: 'linear', // mis-tapped AFTER filling the area grid in
      areas: [{ length: '10', width: '9', thickness: '6', quantity: '1' }],
      cuts: [{ linearFeet: '', cutDepth: '' }],
    };
    const item = buildWorkItemFromEntry(entry) as any;
    expect(item.quantity).toBe(38); // (2*10 + 2*9) * 1
    expect(item.details.cuts.some((c: any) => c.inputMode === 'area')).toBe(true);
  });

  it('H1 — linear feet typed then toggled to areas are still saved', () => {
    const item = buildWorkItemFromEntry({
      ...emptyWorkEntry('SLAB SAW'),
      sawMode: 'areas',
      cuts: [{ linearFeet: '120', cutDepth: '6' }],
      areas: [{ length: '', width: '', thickness: '', quantity: '' }],
    } as any) as any;
    expect(item.quantity).toBe(120);
  });
});
