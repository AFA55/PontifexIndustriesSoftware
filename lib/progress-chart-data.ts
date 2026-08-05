/**
 * Turns the flat entry list from /api/jobs/[id]/progress into bar-chart rows.
 *
 * ── Why this is a separate, tested function ──────────────────────────────────
 * This grouping used to live inline in JobProgressChart and read a shape the
 * API has never returned — `entries[].items[]`. It survived because the
 * endpoint read `job_progress_entries`, a table nothing ever wrote, so
 * `entries` was permanently `[]` and the bad line was never reached.
 *
 * When progress started being derived from real work items (Aug 2026),
 * `entries` became non-empty for the first time and every admin job page
 * crashed with "cannot read properties of undefined (reading 'map')".
 *
 * A latent crash that only fires once real data arrives is exactly the kind a
 * unit test catches and a manual click-through does not — so the logic lives
 * here, with the real production payload as its fixture.
 */

export interface ProgressChartEntry {
  date?: string | null;
  work_type?: string | null;
  quantity_completed?: number | null;
}

export interface ChartRow {
  date: string;
  [workType: string]: string | number;
}

export interface ProgressChartData {
  /** Distinct work types, in first-seen order — one bar series each. */
  workTypes: string[];
  /** One row per day, oldest first, with a total per work type. */
  rows: ChartRow[];
}

/**
 * @param entries  whatever the API returned — may be null, undefined, or
 *                 contain rows with missing dates or work types
 * @param formatDate  how to render a YYYY-MM-DD as an axis label
 */
export function buildProgressChartData(
  entries: ProgressChartEntry[] | null | undefined,
  formatDate: (ymd: string) => string
): ProgressChartData {
  // Only entries carrying BOTH a day and a work type can go on the chart. One
  // missing either is still real work — it just has nothing to plot.
  const plottable = (entries ?? []).filter(
    (e): e is ProgressChartEntry & { date: string; work_type: string } =>
      !!e && typeof e.date === 'string' && !!e.date && typeof e.work_type === 'string' && !!e.work_type
  );

  const workTypes = [...new Set(plottable.map((e) => e.work_type))];
  const dates = [...new Set(plottable.map((e) => e.date))].sort();

  const rows = dates.map((date) => {
    const row: ChartRow = { date: formatDate(date) };
    for (const wt of workTypes) {
      row[wt] = plottable
        .filter((e) => e.date === date && e.work_type === wt)
        .reduce((sum, e) => sum + (Number(e.quantity_completed) || 0), 0);
    }
    return row;
  });

  return { workTypes, rows };
}
