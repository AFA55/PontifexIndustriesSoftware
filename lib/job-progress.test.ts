/**
 * Tests for the operator-work ↔ office-scope bridge.
 *
 * The fixtures are REAL production rows (Aug 2026) — the founder's own job
 * 92482214 is the one whose "Job Scope & Progress" panel read 0% while the
 * ticket showed WALL SAW ×132.
 */

import {
  workFamily,
  quantityInUnit,
  matchWorkItemToScope,
  computeJobProgress,
  type ScopeItemLike,
  type WorkItemLike,
} from './job-progress';

describe('workFamily — the three vocabularies must meet', () => {
  it('maps the operator ticket vocabulary', () => {
    expect(workFamily('WALL SAW')).toBe('wall_sawing');
    expect(workFamily('CORE DRILL')).toBe('core_drilling');
    expect(workFamily('ELECTRIC CORE DRILL')).toBe('core_drilling');
    expect(workFamily('HYDRAULIC CORE DRILL')).toBe('core_drilling');
    expect(workFamily('SPOT/CAUGHT CORES')).toBe('core_drilling');
    expect(workFamily('HAND SAW')).toBe('hand_sawing');
    expect(workFamily('FLUSH CUT HAND SAW')).toBe('hand_sawing');
    expect(workFamily('PUSH SAW')).toBe('hand_sawing');
    expect(workFamily('RING SAW')).toBe('hand_sawing');
    expect(workFamily('CHAIN SAW')).toBe('chain_sawing');
    expect(workFamily('WIRE SAW')).toBe('wire_sawing');
    expect(workFamily('SLAB SAW')).toBe('flat_sawing');
    expect(workFamily('ELECTRIC SLAB SAW')).toBe('flat_sawing');
    expect(workFamily('BROKK')).toBe('brokk');
    expect(workFamily('BREAK & REMOVE')).toBe('demo');
    expect(workFamily('DEMOLITION')).toBe('demo');
    expect(workFamily('IMAGE SCAN')).toBe('gpr');
  });

  it('maps the office scope vocabulary to the SAME families', () => {
    expect(workFamily('Wall/Track Sawing')).toBe('wall_sawing');
    expect(workFamily('Electric Core Drilling')).toBe('core_drilling');
    expect(workFamily('High Frequency Core Drilling')).toBe('core_drilling');
    expect(workFamily('Hydraulic Core Drilling')).toBe('core_drilling');
    expect(workFamily('Handheld / Push Sawing')).toBe('hand_sawing');
    expect(workFamily('Chain Sawing')).toBe('chain_sawing');
    expect(workFamily('Diesel Floor Sawing')).toBe('flat_sawing');
    expect(workFamily('Electric Floor Sawing')).toBe('flat_sawing');
    expect(workFamily('Wire Sawing')).toBe('wire_sawing');
    expect(workFamily('GPR Scanning')).toBe('gpr');
    expect(workFamily('Selective Demo')).toBe('demo');
    expect(workFamily('Brokk')).toBe('brokk');
  });

  it('maps the office service CODES', () => {
    expect(workFamily('WS/TS')).toBe('wall_sawing');
    expect(workFamily('ECD')).toBe('core_drilling');
    expect(workFamily('HFCD')).toBe('core_drilling');
    expect(workFamily('HCD')).toBe('core_drilling');
    expect(workFamily('DFS')).toBe('flat_sawing');
    expect(workFamily('HHS/PS')).toBe('hand_sawing');
    expect(workFamily('CS')).toBe('chain_sawing');
  });

  it('maps the Job Scope panel work_type vocabulary', () => {
    expect(workFamily('core_drilling')).toBe('core_drilling');
    expect(workFamily('wall_sawing')).toBe('wall_sawing');
    expect(workFamily('flat_sawing')).toBe('flat_sawing');
    expect(workFamily('wire_sawing')).toBe('wire_sawing');
  });

  it('does not mistake a hand drill for core drilling', () => {
    expect(workFamily('HAND DRILL')).not.toBe('core_drilling');
  });

  it('is empty-safe', () => {
    expect(workFamily('')).toBe('other');
    expect(workFamily(undefined as unknown as string)).toBe('other');
  });
});

describe('quantityInUnit', () => {
  it('prefers the dedicated measurement over the generic quantity', () => {
    const item: WorkItemLike = { work_type: 'WALL SAW', quantity: 132, linear_feet_cut: 132 };
    expect(quantityInUnit(item, 'linear_ft')).toBe(132);
  });

  it('falls back to quantity when older rows carry no dedicated measurement', () => {
    // Real row: job 45ee313f, WALL SAW, quantity 54, linear_feet_cut NULL.
    const item: WorkItemLike = { work_type: 'WALL SAW', quantity: 54, linear_feet_cut: null };
    expect(quantityInUnit(item, 'linear_ft')).toBe(54);
  });

  it('reads hole counts for core drilling', () => {
    const item: WorkItemLike = { work_type: 'CORE DRILL', quantity: 7, core_quantity: 7 };
    expect(quantityInUnit(item, 'holes')).toBe(7);
  });

  it('refuses to invent a percentage', () => {
    const item: WorkItemLike = { work_type: 'CHAIN SAW', quantity: 40 };
    expect(quantityInUnit(item, 'percent')).toBeNull();
  });

  it('does not count core-drill quantity as linear feet', () => {
    const item: WorkItemLike = { work_type: 'CORE DRILL', quantity: 7, core_quantity: 7 };
    expect(quantityInUnit(item, 'linear_ft')).toBeNull();
  });
});

describe('matchWorkItemToScope', () => {
  const scope: ScopeItemLike[] = [
    { id: 'wall', work_type: 'Wall/Track Sawing', unit: 'linear_ft', target_quantity: 3280, sort_order: 1 },
    { id: 'ecd', work_type: 'Electric Core Drilling', unit: 'holes', target_quantity: 80, sort_order: 2 },
  ];

  it('matches across the vocabulary gap', () => {
    const r = matchWorkItemToScope({ work_type: 'WALL SAW', quantity: 132 }, scope);
    expect(r.scopeItem?.id).toBe('wall');
    expect(r.ambiguous).toBe(false);
  });

  it('returns nothing when the job never scoped that work', () => {
    const r = matchWorkItemToScope({ work_type: 'BROKK', quantity: 1 }, scope);
    expect(r.scopeItem).toBeNull();
  });

  it('disambiguates same-family targets on the qualifier the operator typed', () => {
    const twoCore: ScopeItemLike[] = [
      { id: 'ecd', work_type: 'Electric Core Drilling', unit: 'holes', target_quantity: 10, sort_order: 1 },
      { id: 'hcd', work_type: 'Hydraulic Core Drilling', unit: 'holes', target_quantity: 5, sort_order: 2 },
    ];
    expect(matchWorkItemToScope({ work_type: 'HYDRAULIC CORE DRILL' }, twoCore).scopeItem?.id).toBe('hcd');
    expect(matchWorkItemToScope({ work_type: 'ELECTRIC CORE DRILL' }, twoCore).scopeItem?.id).toBe('ecd');
  });

  it('flags a genuinely ambiguous generic label instead of guessing silently', () => {
    const twoCore: ScopeItemLike[] = [
      { id: 'ecd', work_type: 'Electric Core Drilling', unit: 'holes', target_quantity: 10, sort_order: 1 },
      { id: 'hcd', work_type: 'Hydraulic Core Drilling', unit: 'holes', target_quantity: 5, sort_order: 2 },
    ];
    const r = matchWorkItemToScope({ work_type: 'CORE DRILL' }, twoCore);
    expect(r.scopeItem?.id).toBe('ecd'); // first by sort order
    expect(r.ambiguous).toBe(true);
  });
});

describe("computeJobProgress — the founder's actual job", () => {
  // Job 92482214: office scoped 3280 linear ft of wall sawing + 80 core holes;
  // the operator logged WALL SAW 132 lf and CORE DRILL 7 holes. The panel read 0%.
  const scope: ScopeItemLike[] = [
    { id: 'chain', work_type: 'Chain Sawing', unit: 'percent', target_quantity: 100, sort_order: 1 },
    { id: 'wall', work_type: 'Wall/Track Sawing', unit: 'linear_ft', target_quantity: 3280, sort_order: 2 },
    { id: 'ecd', work_type: 'Electric Core Drilling', unit: 'holes', target_quantity: 80, sort_order: 3 },
    { id: 'dfs', work_type: 'Diesel Floor Sawing', unit: 'linear_ft', target_quantity: 3200, sort_order: 4 },
  ];
  const work: WorkItemLike[] = [
    { work_type: 'WALL SAW', quantity: 132, linear_feet_cut: 132, cut_depth_inches: 9 },
    { work_type: 'CORE DRILL', quantity: 7, core_quantity: 7, core_size: '6' },
  ];

  const result = computeJobProgress(scope, work);
  const byId = (id: string) => result.scope_progress.find((r) => r.scope_item_id === id)!;

  it('finally moves off zero', () => {
    expect(byId('wall').completed_quantity).toBe(132);
    expect(byId('wall').pct_complete).toBeCloseTo(4.0, 1);
    expect(byId('ecd').completed_quantity).toBe(7);
    expect(byId('ecd').pct_complete).toBeCloseTo(8.8, 1);
  });

  it('leaves untouched targets at zero rather than inflating them', () => {
    expect(byId('dfs').completed_quantity).toBe(0);
    expect(byId('dfs').pct_complete).toBe(0);
  });

  it('reports a percent-unit target as underivable, never as 0%', () => {
    expect(byId('chain').derivable).toBe(false);
    expect(byId('chain').pct_complete).toBeNull();
  });

  it('computes an overall figure across derivable targets only', () => {
    // (132 + 7) / (3280 + 80 + 3200) — the percent item is excluded entirely.
    expect(result.overall_pct).toBeCloseTo(2.1, 1);
  });
});

describe('computeJobProgress — honesty about work that does not fit', () => {
  it('surfaces logged work the scope never accounted for', () => {
    const scope: ScopeItemLike[] = [
      { id: 'wall', work_type: 'Wall/Track Sawing', unit: 'linear_ft', target_quantity: 100, sort_order: 1 },
    ];
    const work: WorkItemLike[] = [
      { work_type: 'WALL SAW', quantity: 50, linear_feet_cut: 50 },
      { work_type: 'STANDBY TIME', quantity: 2 },
    ];
    const r = computeJobProgress(scope, work);
    expect(r.unmatched_work).toHaveLength(1);
    expect(r.unmatched_work[0].work_type).toBe('STANDBY TIME');
    expect(r.unmatched_work[0].reason).toBe('no_scope_item_for_this_work');
  });

  it('never exceeds 100% even when the crew overruns the estimate', () => {
    const scope: ScopeItemLike[] = [
      { id: 'wall', work_type: 'Wall/Track Sawing', unit: 'linear_ft', target_quantity: 10, sort_order: 1 },
    ];
    const r = computeJobProgress(scope, [{ work_type: 'WALL SAW', quantity: 500, linear_feet_cut: 500 }]);
    expect(r.scope_progress[0].pct_complete).toBe(100);
    // ...but the real number is preserved so the office can see the overrun.
    expect(r.scope_progress[0].completed_quantity).toBe(500);
  });

  it('handles a job with no scope items at all', () => {
    const r = computeJobProgress([], [{ work_type: 'WALL SAW', quantity: 12 }]);
    expect(r.scope_progress).toHaveLength(0);
    expect(r.overall_pct).toBeNull();
    expect(r.unmatched_work).toHaveLength(1);
  });

  it('handles a scoped job with nothing logged yet', () => {
    const scope: ScopeItemLike[] = [
      { id: 'wall', work_type: 'Wall/Track Sawing', unit: 'linear_ft', target_quantity: 100, sort_order: 1 },
    ];
    const r = computeJobProgress(scope, []);
    expect(r.scope_progress[0].pct_complete).toBe(0);
    expect(r.overall_pct).toBe(0);
  });

  it('sums multiple entries against one target (multi-day / multi-operator)', () => {
    const scope: ScopeItemLike[] = [
      { id: 'ecd', work_type: 'Electric Core Drilling', unit: 'holes', target_quantity: 30, sort_order: 1 },
    ];
    // Real rows from job b3bf0364 — two operators, same day.
    const r = computeJobProgress(scope, [
      { work_type: 'CORE DRILL', quantity: 13, core_quantity: 13 },
      { work_type: 'CORE DRILL', quantity: 10, core_quantity: 10 },
    ]);
    expect(r.scope_progress[0].completed_quantity).toBe(23);
    expect(r.scope_progress[0].entry_count).toBe(2);
  });
});
