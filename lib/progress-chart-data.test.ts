/**
 * Regression guard for the crash that took down every admin job page.
 *
 * The first test is the exact payload /api/jobs/[id]/progress returns for the
 * founder's job JOB-2026-424813 — the one that wouldn't open.
 */

import { buildProgressChartData } from './progress-chart-data';

const fmt = (ymd: string) => ymd.slice(5); // 'MM-DD', enough for assertions

describe('buildProgressChartData — the admin job page crash', () => {
  it("handles the REAL payload from Zack's job without throwing", () => {
    // Verbatim from the live API on 5 Aug 2026.
    const entries = [
      { date: '2026-08-04', work_type: 'CORE DRILL', quantity_completed: 7 },
      { date: '2026-08-04', work_type: 'WALL SAW', quantity_completed: 132 },
    ];
    const { workTypes, rows } = buildProgressChartData(entries, fmt);
    expect(workTypes).toEqual(['CORE DRILL', 'WALL SAW']);
    expect(rows).toEqual([{ date: '08-04', 'CORE DRILL': 7, 'WALL SAW': 132 }]);
  });

  it('does not blow up on the shape the component used to expect', () => {
    // The old code read entries[].items[]. Rows without it must be survivable,
    // not fatal — that assumption is what crashed the page.
    const legacy = [{ date: '2026-08-04', items: undefined }] as never;
    expect(() => buildProgressChartData(legacy, fmt)).not.toThrow();
  });

  it('survives every empty/missing shape', () => {
    for (const input of [null, undefined, [], [null], [undefined]] as never[]) {
      expect(() => buildProgressChartData(input, fmt)).not.toThrow();
      expect(buildProgressChartData(input, fmt).rows).toEqual([]);
    }
  });

  it('skips entries missing a date or a work type rather than crashing', () => {
    const { rows, workTypes } = buildProgressChartData(
      [
        { date: null, work_type: 'WALL SAW', quantity_completed: 10 },
        { date: '2026-08-04', work_type: null, quantity_completed: 5 },
        { date: '2026-08-04', work_type: 'WALL SAW', quantity_completed: 20 },
      ],
      fmt
    );
    expect(workTypes).toEqual(['WALL SAW']);
    expect(rows).toEqual([{ date: '08-04', 'WALL SAW': 20 }]);
  });

  it('sums several entries of the same type on the same day', () => {
    // Two operators coring the same job — must add up, not overwrite.
    const { rows } = buildProgressChartData(
      [
        { date: '2026-08-04', work_type: 'CORE DRILL', quantity_completed: 13 },
        { date: '2026-08-04', work_type: 'CORE DRILL', quantity_completed: 10 },
      ],
      fmt
    );
    expect(rows[0]['CORE DRILL']).toBe(23);
  });

  it('puts days in chronological order and zero-fills absent types', () => {
    const { rows } = buildProgressChartData(
      [
        { date: '2026-08-05', work_type: 'CORE DRILL', quantity_completed: 4 },
        { date: '2026-08-03', work_type: 'WALL SAW', quantity_completed: 50 },
      ],
      fmt
    );
    expect(rows.map((r) => r.date)).toEqual(['08-03', '08-05']);
    expect(rows[0]['CORE DRILL']).toBe(0);
    expect(rows[1]['WALL SAW']).toBe(0);
  });

  it('treats a null or non-numeric quantity as zero', () => {
    const { rows } = buildProgressChartData(
      [
        { date: '2026-08-04', work_type: 'WALL SAW', quantity_completed: null },
        { date: '2026-08-04', work_type: 'WALL SAW', quantity_completed: 'x' as never },
      ],
      fmt
    );
    expect(rows[0]['WALL SAW']).toBe(0);
  });
});
