import { withCutCount, type CutRow } from './cut-rows';

const row = (over: Partial<CutRow> = {}): CutRow => ({
  length: '',
  width: '',
  depth: '',
  ...over,
});

describe('withCutCount', () => {
  it('stamps 1 on a lone row that has no count', () => {
    // The original complaint: the crew's ticket read "0 cuts" beside 316 LF
    // because nothing ever wrote the count the form had stopped asking for.
    expect(withCutCount([row({ linear_feet: '316', depth: '7' })])).toEqual([
      row({ linear_feet: '316', depth: '7', num_cuts: '1' }),
    ]);
  });

  it('RESETS a stored count > 1 when the rows collapse to one', () => {
    // THE REGRESSION THIS PINS. Office adds a 2nd row, types 3 into row 1's
    // "# of Cuts", deletes row 2. The input is hidden at one row, so a fill-only
    // rule left an unreachable 3 behind: the paper ticket printed "3 cuts —
    // 100 LF" for a job that is one cut, and nothing in the UI could correct it.
    // DEMO-2026-000002 stores exactly this shape.
    expect(
      withCutCount([row({ linear_feet: '100', depth: '8', num_cuts: '3', overcut_allowed: true })])
    ).toEqual([row({ linear_feet: '100', depth: '8', num_cuts: '1', overcut_allowed: true })]);
  });

  it('resets a blank-ish count too — whitespace is not a count', () => {
    expect(withCutCount([row({ linear_feet: '40', num_cuts: '  ' })])[0].num_cuts).toBe('1');
  });

  it('resets a zero, which is what printed "0 cuts"', () => {
    expect(withCutCount([row({ linear_feet: '40', num_cuts: '0' })])[0].num_cuts).toBe('1');
  });

  it('leaves every count alone once there is more than one row', () => {
    // With several rows the count genuinely varies and the input is on screen,
    // so the office owns it. Forcing anything here would fight their typing.
    const rows = [
      row({ linear_feet: '20', depth: '6', num_cuts: '4' }),
      row({ linear_feet: '60', depth: '6', num_cuts: '' }),
    ];
    expect(withCutCount(rows)).toBe(rows);
  });

  it('does not touch an empty list', () => {
    expect(withCutCount([])).toEqual([]);
  });

  it('does not clone a row that is already correct', () => {
    // Cheap identity check: this runs on every keystroke in the editor.
    const rows = [row({ linear_feet: '100', num_cuts: '1' })];
    expect(withCutCount(rows)).toBe(rows);
  });

  it('preserves every other field on the row it rewrites', () => {
    const [out] = withCutCount([
      row({
        length: '10',
        width: '4',
        depth: '8',
        linear_feet: '100',
        cross_cut_lengthwise_ft: '12',
        cross_cut_widthwise_ft: '3',
        overcut_allowed: false,
        num_cuts: '7',
      }),
    ]);
    expect(out).toEqual({
      length: '10',
      width: '4',
      depth: '8',
      linear_feet: '100',
      cross_cut_lengthwise_ft: '12',
      cross_cut_widthwise_ft: '3',
      overcut_allowed: false,
      num_cuts: '1',
    });
  });

  it('is idempotent', () => {
    const once = withCutCount([row({ linear_feet: '100', num_cuts: '3' })]);
    expect(withCutCount(once)).toEqual(once);
  });
});
