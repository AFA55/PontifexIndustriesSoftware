/**
 * Takeoffs — sheet view-rotation math.
 *
 * Two things have to be true for "rotate the sheet" to be safe:
 *  1. Our native→display transform is EXACTLY what pdf.js does when the
 *     viewport rotation is bumped by 90°, or the drawing and the markup would
 *     drift apart and every click would land in the wrong place.
 *  2. Rotating changes nothing measurable — a wall that reads 42'-0" before the
 *     turn reads 42'-0" after it, at every rotation, for length AND area.
 *
 * (1) is checked by replaying pdf.js's own PageViewport matrix (transcribed
 * from node_modules/pdfjs-dist/build/pdf.mjs, the `rotateA..rotateD` switch and
 * the `this.transform = [...]` assembly) and comparing it to our helpers.
 */

import {
  addRotation, normalizeRotation, normalizedToNativePoint, polygonAreaPt,
  polylineLengthPt, rotatedPageSize, toDisplayPoint, toNativePoint,
  computeQuantity, type ViewRotation,
} from './geometry';

// ── pdf.js PageViewport, transcribed ────────────────────────────────────────
// viewBox [0,0,W0,H0] in PDF user space (y UP), scale 1, no offsets, dontFlip
// false — the exact configuration lib/takeoffs/pdf-client.ts renders with.
function pdfjsViewport(w0: number, h0: number, rotation: number) {
  const viewBox = [0, 0, w0, h0];
  const centerX = (viewBox[2] + viewBox[0]) / 2;
  const centerY = (viewBox[3] + viewBox[1]) / 2;
  let a: number, b: number, c: number, d: number;
  const r = ((rotation % 360) + 360) % 360;
  switch (r) {
    case 180: a = -1; b = 0; c = 0; d = 1; break;
    case 90: a = 0; b = 1; c = 1; d = 0; break;
    case 270: a = 0; b = -1; c = -1; d = 0; break;
    case 0: a = 1; b = 0; c = 0; d = -1; break;
    default: throw new Error('bad rotation');
  }
  let offsetCanvasX: number, offsetCanvasY: number, width: number, height: number;
  if (a === 0) {
    offsetCanvasX = Math.abs(centerY - viewBox[1]);
    offsetCanvasY = Math.abs(centerX - viewBox[0]);
    width = Math.abs(viewBox[3] - viewBox[1]);
    height = Math.abs(viewBox[2] - viewBox[0]);
  } else {
    offsetCanvasX = Math.abs(centerX - viewBox[0]);
    offsetCanvasY = Math.abs(centerY - viewBox[1]);
    width = Math.abs(viewBox[2] - viewBox[0]);
    height = Math.abs(viewBox[3] - viewBox[1]);
  }
  const transform = [
    a, b, c, d,
    offsetCanvasX - a * centerX - c * centerY,
    offsetCanvasY - b * centerX - d * centerY,
  ];
  return {
    width,
    height,
    // pdf.js convertToViewportPoint(x, y) — PDF user space → canvas pixels.
    convert: (x: number, y: number): [number, number] => [
      transform[0] * x + transform[2] * y + transform[4],
      transform[1] * x + transform[3] * y + transform[5],
    ],
  };
}

// A sheet's NATIVE space (what width_pt/height_pt describe and what geometry is
// stored in) is the viewport at rotation 0: top-left origin, y down.
const W = 3024;  // 42" x 30" ARCH E sheet in points — a real plan-set size
const H = 2160;

const ROTATIONS: ViewRotation[] = [0, 90, 180, 270];

const SAMPLE: [number, number][] = [
  [0, 0], [W, 0], [0, H], [W, H],            // corners
  [W / 2, H / 2],                             // center
  [137.25, 894.5], [2801.9, 41.3], [12, 2033.7],
];

describe('view rotation matches pdf.js viewport rotation', () => {
  it('display size swaps for 90/270 exactly as pdf.js does', () => {
    for (const r of ROTATIONS) {
      const vp = pdfjsViewport(W, H, r);
      expect(rotatedPageSize(W, H, r)).toEqual({ width: vp.width, height: vp.height });
    }
  });

  it('maps every native point where pdf.js puts it', () => {
    const base = pdfjsViewport(W, H, 0);
    for (const r of ROTATIONS) {
      const vp = pdfjsViewport(W, H, r);
      for (const [ux, uy] of SAMPLE) {
        // Same PDF user-space point, expressed in native space by the
        // un-rotated viewport, then rendered by the rotated one.
        const native = base.convert(ux, uy);
        const expected = vp.convert(ux, uy);
        const ours = toDisplayPoint(native, W, H, r);
        expect(ours[0]).toBeCloseTo(expected[0], 9);
        expect(ours[1]).toBeCloseTo(expected[1], 9);
      }
    }
  });

  it('90° is a CLOCKWISE turn (the top-left corner moves to the top-right)', () => {
    expect(toDisplayPoint([0, 0], W, H, 90)).toEqual([H, 0]);      // top-left → top-right
    expect(toDisplayPoint([0, 0], W, H, 270)).toEqual([0, W]);     // top-left → bottom-left
    expect(toDisplayPoint([0, 0], W, H, 180)).toEqual([W, H]);     // top-left → bottom-right
  });

  it('round-trips display → native → display for every rotation', () => {
    for (const r of ROTATIONS) {
      for (const p of SAMPLE) {
        const back = toNativePoint(toDisplayPoint(p, W, H, r), W, H, r);
        expect(back[0]).toBeCloseTo(p[0], 9);
        expect(back[1]).toBeCloseTo(p[1], 9);
      }
    }
  });

  it('four quarter-turns are the identity', () => {
    let p: [number, number] = [911.5, 43.25];
    let dims = { width: W, height: H };
    for (let i = 0; i < 4; i++) {
      p = toDisplayPoint(p, dims.width, dims.height, 90);
      dims = rotatedPageSize(dims.width, dims.height, 90);
    }
    expect(p).toEqual([911.5, 43.25]);
    expect(dims).toEqual({ width: W, height: H });
  });
});

describe('measurements are invariant under rotation', () => {
  // A traced wall-saw run and a demo-area polygon, in native sheet points.
  const run: [number, number][] = [[120, 300], [980, 300], [980, 1250], [1640, 1250]];
  const area: [number, number][] = [[400, 400], [1600, 400], [1600, 1300], [900, 1500], [400, 1300]];
  // 1/4" = 1'-0" on a normal-size sheet.
  const fpp = 0.05555555555555555;

  it('polyline length in points is identical at 0/90/180/270', () => {
    const base = polylineLengthPt(run);
    for (const r of ROTATIONS) {
      const rotated = run.map((p) => toDisplayPoint(p, W, H, r));
      expect(polylineLengthPt(rotated)).toBeCloseTo(base, 9);
    }
  });

  it('polygon area in points² is identical at 0/90/180/270', () => {
    const base = polygonAreaPt(area);
    for (const r of ROTATIONS) {
      const rotated = area.map((p) => toDisplayPoint(p, W, H, r));
      expect(polygonAreaPt(rotated)).toBeCloseTo(base, 6);
    }
  });

  it('a calibration set BEFORE rotating still yields the same real-world numbers', () => {
    // Calibrate: the estimator traced a printed 40'-0" dimension while the
    // sheet was un-rotated. The scale is feet-per-POINT, and points don't move.
    const calibrationLine: [number, number][] = [[500, 900], [500 + 720, 900]];
    const feetPerPoint = 40 / polylineLengthPt(calibrationLine);
    expect(feetPerPoint).toBeCloseTo(fpp, 6);

    const lfBefore = computeQuantity({ type: 'polyline', points: run }, 'linear', feetPerPoint).quantity;
    const sfBefore = computeQuantity({ type: 'polygon', points: area }, 'area', feetPerPoint).quantity;

    for (const r of ROTATIONS) {
      // Re-deriving the scale from the SAME printed dimension after the turn
      // must give the same feet-per-point…
      const rotatedCal = calibrationLine.map((p) => toDisplayPoint(p, W, H, r));
      expect(40 / polylineLengthPt(rotatedCal)).toBeCloseTo(feetPerPoint, 12);
      // …and every measurement keeps its quantity.
      const rotatedRun = run.map((p) => toDisplayPoint(p, W, H, r));
      const rotatedArea = area.map((p) => toDisplayPoint(p, W, H, r));
      expect(computeQuantity({ type: 'polyline', points: rotatedRun }, 'linear', feetPerPoint).quantity)
        .toBeCloseTo(lfBefore, 9);
      expect(computeQuantity({ type: 'polygon', points: rotatedArea }, 'area', feetPerPoint).quantity)
        .toBeCloseTo(sfBefore, 6);
    }
  });

  it('count quantities are untouched by rotation', () => {
    const cores: [number, number][] = [[100, 100], [200, 400], [1500, 1900]];
    for (const r of ROTATIONS) {
      const rotated = cores.map((p) => toDisplayPoint(p, W, H, r));
      expect(computeQuantity({ type: 'count', points: rotated }, 'count', fpp).quantity).toBe(3);
    }
  });
});

describe('rotation value handling', () => {
  it('normalizes anything to a legal quarter-turn', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation('180')).toBe(180);
    expect(normalizeRotation(45)).toBe(0);     // not a quarter-turn → ignore
    expect(normalizeRotation(null)).toBe(0);
    expect(normalizeRotation(undefined)).toBe(0);
    expect(normalizeRotation('nonsense')).toBe(0);
  });

  it('adds quarter-turns with wraparound', () => {
    expect(addRotation(270, 90)).toBe(0);
    expect(addRotation(0, -90)).toBe(270);
    expect(addRotation(180, 180)).toBe(0);
  });
});

describe('AI suggestions measured on a rotated render land in native space', () => {
  it('un-rotates normalized image coords back onto the sheet', () => {
    // The model sees the sheet turned 90° and points at the middle of the
    // image's top edge. Native-space answer: middle of the sheet's LEFT edge.
    expect(normalizedToNativePoint(0.5, 0, W, H, 90)).toEqual([0, H / 2]);
    // Un-rotated render → the obvious mapping.
    expect(normalizedToNativePoint(0.5, 0.25, W, H, 0)).toEqual([W / 2, H / 4]);
    // Out-of-range values are clamped, never NaN.
    expect(normalizedToNativePoint(1.4, -0.2, W, H, 0)).toEqual([W, 0]);
    expect(normalizedToNativePoint(NaN, NaN, W, H, 180)).toEqual([W, H]);
  });

  it('a suggestion sized on the rotated image keeps its length on the sheet', () => {
    const onImage: [number, number][] = [[0.1, 0.2], [0.6, 0.2]];
    const native = onImage.map(([x, y]) => normalizedToNativePoint(x, y, W, H, 90));
    // 0.5 of the rotated image's width — and the rotated image is H wide.
    expect(polylineLengthPt(native)).toBeCloseTo(0.5 * H, 9);
  });
});
