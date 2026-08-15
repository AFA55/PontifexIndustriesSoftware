/**
 * Recharts colours for the app's light and dark themes.
 *
 * WHY THIS EXISTS: Recharts paints its grid, axis ticks and tooltip through
 * INLINE STYLE props, not className — so a `dark:` Tailwind variant cannot
 * reach them. Every chart in the app therefore hardcoded slate-100/slate-400
 * and a default white tooltip, which is invisible-to-illegible on the dark
 * indigo surface: the tooltip in particular rendered as a white card with
 * near-white text. The card around it can be fixed with `dark:` classes; the
 * chart internals need real values, so they get resolved from the theme here.
 *
 * Pure and dependency-free so it is unit-testable and so a chart component only
 * has to ask `chartThemeColors(theme)`.
 */

export type ChartTheme = 'light' | 'dark' | string | null | undefined;

export interface ChartColors {
  /** CartesianGrid stroke. */
  grid: string;
  /** XAxis/YAxis tick fill. */
  tick: string;
  /** Tooltip card background. */
  tooltipBg: string;
  /** Tooltip card border. */
  tooltipBorder: string;
  /** Tooltip text. */
  tooltipText: string;
  /** Legend text. */
  legendText: string;
}

const LIGHT: ChartColors = {
  grid: '#f1f5f9', // slate-100
  tick: '#94a3b8', // slate-400
  tooltipBg: '#ffffff',
  tooltipBorder: '#e2e8f0', // slate-200
  tooltipText: '#0f172a', // slate-900
  legendText: '#475569', // slate-600
};

const DARK: ChartColors = {
  grid: 'rgba(255,255,255,0.08)',
  tick: 'rgba(255,255,255,0.45)',
  tooltipBg: '#180c2c', // matches the dark card gradient's top stop
  tooltipBorder: 'rgba(255,255,255,0.14)',
  tooltipText: '#ffffff',
  legendText: 'rgba(255,255,255,0.7)',
};

/**
 * Anything that is not exactly 'dark' resolves to the light palette — an
 * unresolved/SSR theme must not paint a dark tooltip onto a white card.
 */
export function chartThemeColors(theme: ChartTheme): ChartColors {
  return theme === 'dark' ? DARK : LIGHT;
}
