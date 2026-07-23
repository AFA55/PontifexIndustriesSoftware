/**
 * Takeoffs — shared geometry + scale math (client AND server import this;
 * the server recomputes every quantity on save so a client can't corrupt
 * totals — see docs/plans/TAKEOFFS_MODULE_PLAN.md §7).
 *
 * COORDINATES: all geometry lives in PDF page space (points, 72/inch,
 * top-left origin as produced by pdf.js viewports at scale 1). Rendering is
 * a single affine transform on top; the stored numbers never change with
 * zoom, so they survive any future renderer swap.
 */

export type TakeoffGeometry =
  | { type: 'polyline'; points: [number, number][] }
  | { type: 'count'; points: [number, number][] };

/** Length of a polyline in PDF points (scale-free). */
export function polylineLengthPt(points: [number, number][]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

/**
 * feet-per-PDF-point for a named architectural scale.
 * `1/4" = 1'-0"` → paperInches=0.25 realFeet=1 → ratio 48 → 48/72/12 ≈ 0.0556.
 * userUnit: PDF 1.6 oversized-sheet multiplier (points are 72/userUnit per inch).
 */
export function feetPerPointFromScale(paperInches: number, realFeet: number, userUnit = 1): number {
  const ratio = (realFeet * 12) / paperInches; // real inches per paper inch
  return (ratio / 72 / 12) * userUnit;
}

/** Named scales offered in the calibrate UI. */
export const NAMED_SCALES: { label: string; paperInches: number; realFeet: number }[] = [
  { label: '1" = 1\'-0"', paperInches: 1, realFeet: 1 },
  { label: '3/4" = 1\'-0"', paperInches: 0.75, realFeet: 1 },
  { label: '1/2" = 1\'-0"', paperInches: 0.5, realFeet: 1 },
  { label: '3/8" = 1\'-0"', paperInches: 0.375, realFeet: 1 },
  { label: '1/4" = 1\'-0"', paperInches: 0.25, realFeet: 1 },
  { label: '3/16" = 1\'-0"', paperInches: 0.1875, realFeet: 1 },
  { label: '1/8" = 1\'-0"', paperInches: 0.125, realFeet: 1 },
  { label: '1/16" = 1\'-0"', paperInches: 0.0625, realFeet: 1 },
  { label: '1" = 10\'', paperInches: 1, realFeet: 10 },
  { label: '1" = 20\'', paperInches: 1, realFeet: 20 },
  { label: '1" = 30\'', paperInches: 1, realFeet: 30 },
  { label: '1" = 40\'', paperInches: 1, realFeet: 40 },
  { label: '1" = 50\'', paperInches: 1, realFeet: 50 },
];

/** Snap a calibrated feet_per_point to the nearest named scale within 2%. */
export function snapToNamedScale(feetPerPoint: number, userUnit = 1): { label: string; feetPerPoint: number } | null {
  for (const s of NAMED_SCALES) {
    const fpp = feetPerPointFromScale(s.paperInches, s.realFeet, userUnit);
    if (Math.abs(fpp - feetPerPoint) / fpp <= 0.02) return { label: s.label, feetPerPoint: fpp };
  }
  return null;
}

/**
 * Compute the quantity for a measurement.
 * linear → LF (feet); count → EA. (Area ships in a later phase.)
 * Returns { quantity, rawLengthPt } — rawLengthPt kept so recalibrating a
 * page is a single multiply, never a geometry re-read.
 */
export function computeQuantity(
  geometry: TakeoffGeometry,
  measureType: 'linear' | 'count' | 'area',
  scaleFeetPerPoint: number | null
): { quantity: number; rawLengthPt: number | null } {
  if (measureType === 'count') {
    return { quantity: geometry.points.length, rawLengthPt: null };
  }
  if (measureType === 'linear' && geometry.type === 'polyline') {
    const raw = polylineLengthPt(geometry.points);
    const quantity = scaleFeetPerPoint ? raw * scaleFeetPerPoint : 0;
    return { quantity, rawLengthPt: raw };
  }
  return { quantity: 0, rawLengthPt: null };
}

/** 34.54 → `34'-6"` for display. */
export function formatFeetInches(feet: number): string {
  const sign = feet < 0 ? '-' : '';
  const abs = Math.abs(feet);
  let ft = Math.floor(abs);
  let inches = Math.round((abs - ft) * 12);
  if (inches === 12) { ft += 1; inches = 0; }
  return inches > 0 ? `${sign}${ft}'-${inches}"` : `${sign}${ft}'`;
}

/** Basic geometry validation for API input. */
export function isValidGeometry(g: any): g is TakeoffGeometry {
  if (!g || typeof g !== 'object') return false;
  if (g.type !== 'polyline' && g.type !== 'count') return false;
  if (!Array.isArray(g.points) || g.points.length === 0 || g.points.length > 2000) return false;
  return g.points.every(
    (p: any) =>
      Array.isArray(p) && p.length === 2 &&
      Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
      Math.abs(p[0]) < 1e6 && Math.abs(p[1]) < 1e6
  );
}
