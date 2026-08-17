import { applySubOption, showWhenMap } from './equipment-sub-options';

/**
 * The catalogs these tests mirror live in the schedule form's
 * SERVICE_EQUIPMENT map. They are duplicated here deliberately and kept small:
 * the point is the PRUNING RULE, not the catalog contents.
 */
const DFS_ITEMS = [
  { id: 'electric_saw_hp', showWhen: 'electric_slab' },
  { id: 'slurry_drums' },
  { id: 'extra_vacuum_head' },
  { id: 'backup_saw' },
  { id: 'chalk_line' },
  { id: 'clear_spray' },
];

const WSTS_ITEMS = [
  { id: '480_cord', showWhen: 'pentruder' },
  { id: '32_guard', showWhen: 'pentruder' },
  { id: 'generator', showWhen: 'pbg' },
  { id: 'hydraulic_hose', showWhen: 'pbg' },
  { id: 'plastic' },
  { id: 'chalk_line' },
];

const dfsGates = showWhenMap(DFS_ITEMS);
const wstsGates = showWhenMap(WSTS_ITEMS);

describe('showWhenMap', () => {
  it('maps only the gated items', () => {
    expect(dfsGates).toEqual({ electric_saw_hp: 'electric_slab' });
  });

  it('treats an ungated item as absent rather than undefined-valued', () => {
    expect('slurry_drums' in dfsGates).toBe(false);
  });

  it('survives an empty catalog', () => {
    expect(showWhenMap([])).toEqual({});
  });
});

describe('applySubOption — DFS saw picker', () => {
  it('records the chosen saw', () => {
    expect(applySubOption({}, 'husqvarna_7000', dfsGates)).toEqual({ _sub: 'husqvarna_7000' });
  });

  it('keeps the picks that belong to the SERVICE, not the machine', () => {
    // This is the production shape: every DFS row predates the saw picker and
    // has no _sub. Choosing a saw on an existing job must not disturb them.
    const existing = {
      slurry_drums: '2',
      extra_vacuum_head: 'yes',
      chalk_line: 'yes',
      clear_spray: 'yes',
    };
    expect(applySubOption(existing, 'tier4', dfsGates)).toEqual({
      ...existing,
      _sub: 'tier4',
    });
  });

  it('keeps the HP pick while the electric slab saw is still selected', () => {
    const picks = { _sub: 'electric_slab', electric_saw_hp: '40 HP', slurry_drums: 'yes' };
    expect(applySubOption(picks, 'electric_slab', dfsGates)).toEqual(picks);
  });

  it('DROPS the HP pick when the saw changes to a diesel machine', () => {
    // The whole reason this function exists: the Motor row disappears from the
    // form the moment showWhen stops matching, so leaving '40 HP' in the row
    // would print "slab saw motor (40 HP)" on a Tier 4 ticket with no control
    // left on screen to unpick it.
    const picks = { _sub: 'electric_slab', electric_saw_hp: '40 HP', slurry_drums: 'yes' };
    expect(applySubOption(picks, 'tier4', dfsGates)).toEqual({
      _sub: 'tier4',
      slurry_drums: 'yes',
    });
  });

  it('drops the HP pick when the saw is deselected entirely', () => {
    const picks = { _sub: 'electric_slab', electric_saw_hp: '15 HP', chalk_line: 'yes' };
    expect(applySubOption(picks, '', dfsGates)).toEqual({ chalk_line: 'yes' });
  });

  it('removes _sub when cleared', () => {
    expect(applySubOption({ _sub: 'white_saw' }, '', dfsGates)).toEqual({});
  });
});

describe('applySubOption — WS/TS system picker', () => {
  it('swaps Pentruder gear for PBG gear', () => {
    const picks = {
      _sub: 'pentruder',
      '480_cord': '100',
      '32_guard': 'yes',
      plastic: 'yes',
      chalk_line: 'yes',
    };
    expect(applySubOption(picks, 'pbg', wstsGates)).toEqual({
      _sub: 'pbg',
      plastic: 'yes',
      chalk_line: 'yes',
    });
  });

  it('is a no-op on the same value apart from re-stamping _sub', () => {
    const picks = { _sub: 'pbg', generator: 'yes', hydraulic_hose: '50', plastic: 'yes' };
    expect(applySubOption(picks, 'pbg', wstsGates)).toEqual(picks);
  });
});

describe('applySubOption — safety', () => {
  it('never mutates the input', () => {
    const picks = { _sub: 'electric_slab', electric_saw_hp: '15 HP' };
    const snapshot = { ...picks };
    applySubOption(picks, 'tier4', dfsGates);
    expect(picks).toEqual(snapshot);
  });

  it('tolerates null / undefined picks', () => {
    expect(applySubOption(null, 'tier4', dfsGates)).toEqual({ _sub: 'tier4' });
    expect(applySubOption(undefined, '', dfsGates)).toEqual({});
  });

  it('keeps unknown keys — a pick we do not recognise is still a pick', () => {
    // Dynamic core-bit ids are generated at render time and are never in the
    // static catalog. Dropping them would delete real selections.
    const picks = { core_bit_10: '1', legacy_thing: 'yes' };
    expect(applySubOption(picks, 'tier4', dfsGates)).toEqual({
      core_bit_10: '1',
      legacy_thing: 'yes',
      _sub: 'tier4',
    });
  });
});
