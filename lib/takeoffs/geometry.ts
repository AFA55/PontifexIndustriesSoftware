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
  | { type: 'polygon'; points: [number, number][] }
  | { type: 'count'; points: [number, number][] };

// ── View rotation ───────────────────────────────────────────────────────────
// The estimator can turn a sheet 90° at a time when a set was saved sideways.
// This is a RENDER-ONLY transform: stored geometry never leaves the sheet's
// native PDF-point space (the space width_pt/height_pt describe), so rotating
// can never corrupt a calibration or an existing measurement.
//
// The mapping below is the exact composition pdf.js applies when you bump a
// viewport's rotation by 90° (derived from PageViewport's rotateA..D matrix in
// pdfjs-dist/build/pdf.mjs — see lib/takeoffs/rotation.test.ts, which replays
// that matrix and asserts these helpers agree with it):
//   native (x, y) in a W×H sheet, y DOWN, origin top-left
//     0°   → (x,      y    )   display W×H
//     90°  → (H - y,  x    )   display H×W   (clockwise)
//     180° → (W - x,  H - y)   display W×H
//     270° → (y,      W - x)   display H×W
// Rotations are rigid motions, so every length and area is invariant — that is
// the whole reason we can rotate the render and leave the numbers alone.

export type ViewRotation = 0 | 90 | 180 | 270;

/** Coerce anything (DB value, query param, stale state) to a legal rotation. */
export function normalizeRotation(value: unknown): ViewRotation {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  const m = ((n % 360) + 360) % 360;
  return m === 90 || m === 180 || m === 270 ? m : 0;
}

/** Add a quarter-turn (or several) to a rotation, wrapping at 360. */
export function addRotation(rotation: ViewRotation, delta: number): ViewRotation {
  return normalizeRotation(rotation + delta);
}

/** On-screen size of a W×H sheet at a rotation (90/270 swap the axes). */
export function rotatedPageSize(
  width: number, height: number, rotation: ViewRotation
): { width: number; height: number } {
  return rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };
}

/** Native sheet coords → rotated display coords. */
export function toDisplayPoint(
  point: [number, number], width: number, height: number, rotation: ViewRotation
): [number, number] {
  const [x, y] = point;
  switch (rotation) {
    case 90: return [height - y, x];
    case 180: return [width - x, height - y];
    case 270: return [y, width - x];
    default: return [x, y];
  }
}

/** Rotated display coords → native sheet coords (the exact inverse). */
export function toNativePoint(
  point: [number, number], width: number, height: number, rotation: ViewRotation
): [number, number] {
  const [dx, dy] = point;
  switch (rotation) {
    case 90: return [dy, height - dx];
    case 180: return [width - dx, height - dy];
    case 270: return [width - dy, dx];
    default: return [dx, dy];
  }
}

export function toDisplayPoints(
  points: [number, number][], width: number, height: number, rotation: ViewRotation
): [number, number][] {
  return rotation === 0 ? points : points.map((p) => toDisplayPoint(p, width, height, rotation));
}

/**
 * Normalized [0..1] coords measured on a ROTATED render of the sheet (what the
 * vision model sees when the estimator has turned the page) → native PDF pts.
 */
export function normalizedToNativePoint(
  xNorm: number, yNorm: number, width: number, height: number, rotation: ViewRotation
): [number, number] {
  const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
  const size = rotatedPageSize(width, height, rotation);
  return toNativePoint([clamp01(xNorm) * size.width, clamp01(yNorm) * size.height], width, height, rotation);
}

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
 * Area of a closed polygon in PDF points² (scale-free), via the shoelace
 * formula. The polygon auto-closes (last→first); winding direction is
 * irrelevant (we take the absolute value).
 */
export function polygonAreaPt(points: [number, number][]): number {
  const n = points.length;
  if (n < 3) return 0;
  let twice = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
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
 * linear → LF (feet); count → EA; area → SF (square feet).
 * Returns { quantity, rawLengthPt, rawAreaPt } — the raw scale-free values are
 * kept so recalibrating a page is a single multiply, never a geometry re-read.
 * Area scales as the SQUARE of feet-per-point (SF = area_pt × fpp²).
 */
export function computeQuantity(
  geometry: TakeoffGeometry,
  measureType: 'linear' | 'count' | 'area',
  scaleFeetPerPoint: number | null
): { quantity: number; rawLengthPt: number | null; rawAreaPt: number | null } {
  if (measureType === 'count') {
    return { quantity: geometry.points.length, rawLengthPt: null, rawAreaPt: null };
  }
  if (measureType === 'linear' && geometry.type === 'polyline') {
    const raw = polylineLengthPt(geometry.points);
    const quantity = scaleFeetPerPoint ? raw * scaleFeetPerPoint : 0;
    return { quantity, rawLengthPt: raw, rawAreaPt: null };
  }
  if (measureType === 'area' && geometry.type === 'polygon') {
    const rawArea = polygonAreaPt(geometry.points);
    const quantity = scaleFeetPerPoint ? rawArea * scaleFeetPerPoint * scaleFeetPerPoint : 0;
    return { quantity, rawLengthPt: null, rawAreaPt: rawArea };
  }
  return { quantity: 0, rawLengthPt: null, rawAreaPt: null };
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

/** 1240.6 → `1,241 SF` for display (square feet, whole numbers). */
export function formatSqFeet(sf: number): string {
  return `${Math.round(sf).toLocaleString('en-US')} SF`;
}

/** Basic geometry validation for API input. A polygon needs ≥3 vertices. */
export function isValidGeometry(g: any): g is TakeoffGeometry {
  if (!g || typeof g !== 'object') return false;
  if (g.type !== 'polyline' && g.type !== 'polygon' && g.type !== 'count') return false;
  if (!Array.isArray(g.points) || g.points.length > 2000) return false;
  const min = g.type === 'polygon' ? 3 : 1;
  if (g.points.length < min) return false;
  return g.points.every(
    (p: any) =>
      Array.isArray(p) && p.length === 2 &&
      Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
      Math.abs(p[0]) < 1e6 && Math.abs(p[1]) < 1e6
  );
}

/**
 * Snap a segment's end point to the nearest 45° (0/45/90/135/…) relative to
 * its start — the "ortho/angle constrain" behavior (hold Shift while drawing).
 * All math in PDF-point space so it is zoom/scale-independent.
 */
export function snapAngle(from: [number, number], to: [number, number]): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return to;
  const step = Math.PI / 4; // 45°
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return [from[0] + Math.cos(angle) * dist, from[1] + Math.sin(angle) * dist];
}
