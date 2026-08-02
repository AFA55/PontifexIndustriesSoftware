/**
 * Tests for the work-item formatting helpers — the summary string that feeds
 * invoices/portal (job_orders.work_performed), the compact detail lines the
 * admin renders use, and the difficulty label ↔ rating mapping.
 */

import {
  buildWorkPerformedSummary,
  difficultyToRating,
  ratingToDifficultyLabel,
  summarizeWorkItem,
  workItemDetailLine,
} from './work-items-format';

describe('difficultyToRating', () => {
  it('maps the operator labels to the daily-log 1–5 scale', () => {
    expect(difficultyToRating('easy')).toBe(1);
    expect(difficultyToRating('moderate')).toBe(2);
    expect(difficultyToRating('medium')).toBe(3);
    expect(difficultyToRating('difficult')).toBe(4);
    expect(difficultyToRating('hard')).toBe(5);
  });
  it('is case/whitespace tolerant and null-safe', () => {
    expect(difficultyToRating(' Easy ')).toBe(1);
    expect(difficultyToRating('DIFFICULT')).toBe(4);
    expect(difficultyToRating('')).toBeNull();
    expect(difficultyToRating(null)).toBeNull();
    expect(difficultyToRating(undefined)).toBeNull();
    expect(difficultyToRating('nope')).toBeNull();
  });
});

describe('ratingToDifficultyLabel', () => {
  it('buckets 1–5 into Easy / Moderate / Difficult', () => {
    expect(ratingToDifficultyLabel(1)).toBe('Easy');
    // 2 = the picker's "moderate" (and legacy daily-log rows) — must NOT read as Easy
    expect(ratingToDifficultyLabel(2)).toBe('Moderate');
    expect(ratingToDifficultyLabel(3)).toBe('Moderate');
    expect(ratingToDifficultyLabel(4)).toBe('Difficult');
    expect(ratingToDifficultyLabel(5)).toBe('Difficult');
  });
  it('returns null for missing/invalid ratings', () => {
    expect(ratingToDifficultyLabel(null)).toBeNull();
    expect(ratingToDifficultyLabel(undefined)).toBeNull();
    expect(ratingToDifficultyLabel(0)).toBeNull();
  });
});

describe('workItemDetailLine', () => {
  it('enumerates ALL core-drilling holes from details_json', () => {
    const line = workItemDetailLine({
      work_type: 'CORE DRILL',
      quantity: 3,
      details_json: {
        holes: [
          { bitSize: '4"', depthInches: 10, quantity: 2 },
          { bitSize: '6', depthInches: 12, quantity: 1 },
        ],
      },
    });
    expect(line).toBe('2× 4" @ 10", 1× 6" @ 12"');
  });

  it('flags steel on a hole', () => {
    const line = workItemDetailLine({
      details_json: { holes: [{ bitSize: '4', depthInches: 8, quantity: 1, cutSteel: true }] },
    });
    expect(line).toContain('steel');
  });

  it('describes sawing cuts with LF, depth and wet/dry', () => {
    const line = workItemDetailLine({
      work_type: 'SLAB SAW',
      details_json: {
        cutType: 'wet',
        cuts: [{ linearFeet: 120, cutDepth: 6 }],
      },
    });
    expect(line).toBe('120 LF @ 6" (wet)');
  });

  it('falls back to flat columns when details_json is absent', () => {
    expect(
      workItemDetailLine({ core_quantity: 4, core_size: '4"', core_depth_inches: 10 })
    ).toBe('4 cores (4" @ 10")');
    expect(
      workItemDetailLine({ linear_feet_cut: 80, cut_depth_inches: 6 })
    ).toBe('80 LF @ 6"');
  });

  it('returns empty string when there is no detail at all', () => {
    expect(workItemDetailLine({ work_type: 'CLEANUP', quantity: 1 })).toBe('');
  });
});

describe('summarizeWorkItem', () => {
  it('composes label ×qty (detail) — note', () => {
    const s = summarizeWorkItem({
      work_type: 'CORE DRILL',
      quantity: 3,
      notes: 'tight access on the mezzanine',
      details_json: { holes: [{ bitSize: '4', depthInches: 10, quantity: 3 }] },
    });
    expect(s).toBe('CORE DRILL ×3 (3× 4" @ 10") — tight access on the mezzanine');
  });

  it('truncates very long notes', () => {
    const s = summarizeWorkItem({ work_type: 'REPAIR', quantity: 1, notes: 'x'.repeat(200) });
    expect(s.length).toBeLessThan(120);
    expect(s).toContain('…');
  });
});

describe('buildWorkPerformedSummary', () => {
  it('returns empty string for no items', () => {
    expect(buildWorkPerformedSummary([])).toBe('');
  });

  it('single day: items joined with "; " and NO day prefix', () => {
    const s = buildWorkPerformedSummary([
      {
        work_type: 'CORE DRILL',
        quantity: 3,
        day_number: 1,
        details_json: {
          holes: [
            { bitSize: '4', depthInches: 10, quantity: 2 },
            { bitSize: '6', depthInches: 12, quantity: 1 },
          ],
        },
      },
      { work_type: 'SLAB SAW', quantity: 1, day_number: 1, details_json: { cutType: 'wet', cuts: [{ linearFeet: 120, cutDepth: 6 }] } },
    ]);
    expect(s).toBe(
      'CORE DRILL ×3 (2× 4" @ 10", 1× 6" @ 12"); SLAB SAW ×1 (120 LF @ 6" (wet))'
    );
    expect(s).not.toContain('Day 1');
  });

  it('multi-day: "Day N:" prefixes joined with " | "', () => {
    const s = buildWorkPerformedSummary([
      { work_type: 'CORE DRILL', quantity: 1, day_number: 1, core_quantity: 2, core_size: '4', core_depth_inches: 10 },
      { work_type: 'SLAB SAW', quantity: 1, day_number: 2, linear_feet_cut: 60 },
    ]);
    expect(s).toBe('Day 1: CORE DRILL ×1 (2 cores (4" @ 10")) | Day 2: SLAB SAW ×1 (60 LF)');
  });

  it('treats missing day_number as day 1 (legacy rows)', () => {
    const s = buildWorkPerformedSummary([
      { work_type: 'CLEANUP', quantity: 1 },
      { work_type: 'REPAIR', quantity: 2, day_number: 1 },
    ]);
    expect(s).toBe('CLEANUP ×1; REPAIR ×2');
  });

  it('never emits raw JSON', () => {
    const s = buildWorkPerformedSummary([
      { work_type: 'CORE DRILL', quantity: 1, details_json: { holes: [{ bitSize: '4', depthInches: 10 }] } },
    ]);
    expect(s).not.toContain('{');
    expect(s).not.toContain('[');
  });
});
