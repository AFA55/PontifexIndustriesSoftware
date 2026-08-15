import { chartThemeColors } from './chart-theme';

describe('chartThemeColors', () => {
  it('gives the dark theme a dark tooltip with light text', () => {
    const c = chartThemeColors('dark');
    expect(c.tooltipBg).not.toBe('#ffffff');
    expect(c.tooltipText).toBe('#ffffff');
  });

  it('gives the light theme a white tooltip with dark text', () => {
    const c = chartThemeColors('light');
    expect(c.tooltipBg).toBe('#ffffff');
    expect(c.tooltipText).toBe('#0f172a');
  });

  it('falls back to light for an unresolved theme — never a dark tooltip on a white card', () => {
    for (const t of [null, undefined, '', 'system']) {
      expect(chartThemeColors(t)).toEqual(chartThemeColors('light'));
    }
  });

  it('keeps grid and tick distinct from the surface in both themes', () => {
    for (const t of ['light', 'dark'] as const) {
      const c = chartThemeColors(t);
      expect(c.grid).toBeTruthy();
      expect(c.tick).toBeTruthy();
      expect(c.grid).not.toBe(c.tick);
    }
  });
});
