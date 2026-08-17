/**
 * The "# of Cuts" rule for the schedule form's LINEAR CUTS rows.
 *
 * THE FOUNDER'S ASK (Aug 17 2026): "For linear ft, if they only added 1 area
 * then make number of cuts 1 because it's just inputting linear ft." Asking for
 * a count beside a single row makes the form longer and produced blank counts
 * downstream — the crew's digital ticket read "0 cuts" beside 316 LF.
 *
 * So the form hides the `# of Cuts` input while there is exactly one row, and
 * stamps the count itself.
 *
 * WHY THE STAMP HAD TO BE A FORCE AND NOT A FILL. The first cut of this only
 * filled a BLANK count, which sounds conservative and is actually the same bug
 * inverted:
 *
 *   office adds a 2nd row → types 3 into row 1's "# of Cuts" → deletes row 2
 *   → stored [{ linear_feet: "100", num_cuts: "3" }]
 *
 * The input is gone at that point, so the office can neither SEE the 3 nor
 * change it, and the paper field ticket prints "3 cuts — 100 LF" while the
 * crew's digital ticket shows 3 cuts of a job that is one cut. There is no way
 * to correct it short of adding a row back. One row IS one cut, per the
 * founder; there is no case where a lone row legitimately carries 3. So
 * collapsing to one row resets the count.
 *
 * WHAT THIS DOES NOT DO: rewrite stored jobs. It runs on SAVE of the cuts the
 * office is actively editing, exactly like the fill did — a job nobody opens is
 * never touched. `DEMO-2026-000002` (cancelled) already carries the bad shape;
 * it corrects itself the moment someone edits that scope, and stays as-is
 * otherwise.
 *
 * Pure: no React, no fetch. Unit-tested in `cut-rows.test.ts`.
 */

/**
 * One row of the Linear Cuts editor. `length`/`width` are legacy — rows saved
 * before the mode split stored an area there and the reader still honours them.
 */
export interface CutRow {
  length: string;
  width: string;
  depth: string;
  cross_cut_lengthwise_ft?: string;
  cross_cut_widthwise_ft?: string;
  overcut_allowed?: boolean;
  /** Backward-compat: legacy entries stored linear_feet/num_cuts directly. */
  linear_feet?: string;
  num_cuts?: string;
}

/**
 * Normalise the cut count before the rows are serialised.
 *
 * Exactly one row → `num_cuts` is forced to '1', whatever was there. Several
 * rows → untouched, because the count genuinely varies per row and the input is
 * on screen for the office to set.
 */
export function withCutCount<T extends CutRow>(rows: T[]): T[] {
  if (rows.length !== 1) return rows;
  const only = rows[0];
  if (only.num_cuts === '1') return rows; // no-op, keep the identity stable
  return [{ ...only, num_cuts: '1' }];
}
