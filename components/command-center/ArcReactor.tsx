'use client';

import { useEffect, useRef } from 'react';

/**
 * ArcReactor — the Command Center centerpiece.
 *
 * A vanilla <canvas> 2D arc-reactor: concentric rings rotating at different
 * speeds/directions in the Pontifex journey gradient (violet → pink → red) over
 * deep indigo, with a bright pulsing core. No external 3D/canvas libraries.
 *
 * WHY CANVAS (not SVG): the effect is many arcs + particles redrawn every frame
 * at 60fps. Canvas paints that in one GPU-compositable surface; an equivalent SVG
 * would animate dozens of DOM nodes and thrash layout. Canvas is the cheap path.
 *
 * STATE / AMPLITUDE WIRING (for Phase 3 voice):
 *   - `state` drives spin speed + ring behavior:
 *       idle      → slow majestic spin + gentle breathing pulse
 *       listening → ring ripple, medium spin
 *       thinking  → faster spin + shimmer
 *       speaking  → core scales/pulses to `amplitude`
 *   - `amplitude` (0..1) is the live voice loudness. In Phase 1 nothing drives it,
 *     so when it's ~0 we synthesize a soft breathing sine internally. Phase 3 will
 *     feed a Web Audio AnalyserNode value here and the core will react to the voice.
 *
 * Props are read through a ref inside the animation loop, so changing `state` or
 * `amplitude` never tears down / restarts requestAnimationFrame (no flicker).
 *
 * Respects prefers-reduced-motion: renders a single static frame, no rAF loop.
 *
 * NOTE: this is an intentional DARK HUD. Colors are hardcoded brand hex and do
 * NOT invert for light mode — that is by design.
 */

export type ArcReactorState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface ArcReactorProps {
  state?: ArcReactorState;
  /** Live voice amplitude 0..1 (Phase 3). Phase 1 leaves this undefined. */
  amplitude?: number;
  /** Rendered pixel size (square). Defaults to 320. */
  size?: number;
  className?: string;
}

// Brand journey gradient stops.
const VIOLET = '#7C3AED';
const PINK = '#DB2777';
const RED = '#EF4444';

interface Ring {
  /** Base radius as a fraction of the reactor radius. */
  r: number;
  /** Rotation speed in radians/sec (sign = direction). */
  speed: number;
  /** Arc gap pattern: list of [startFrac, lengthFrac] around the circle. */
  segments: Array<[number, number]>;
  width: number;
  color: string;
  glow: number;
}

const RINGS: Ring[] = [
  { r: 0.92, speed: 0.18, segments: [[0, 0.12], [0.25, 0.18], [0.55, 0.1], [0.72, 0.2]], width: 2, color: VIOLET, glow: 8 },
  { r: 0.78, speed: -0.32, segments: [[0.05, 0.3], [0.45, 0.25], [0.8, 0.12]], width: 3, color: PINK, glow: 10 },
  { r: 0.62, speed: 0.5, segments: [[0, 0.2], [0.28, 0.2], [0.55, 0.2], [0.82, 0.12]], width: 2.5, color: RED, glow: 9 },
  { r: 0.48, speed: -0.7, segments: [[0.1, 0.35], [0.6, 0.3]], width: 4, color: PINK, glow: 12 },
  { r: 0.34, speed: 1.05, segments: [[0, 0.45], [0.55, 0.4]], width: 2, color: VIOLET, glow: 7 },
];

const SPEED_BY_STATE: Record<ArcReactorState, number> = {
  idle: 1,
  listening: 1.4,
  thinking: 2.3,
  speaking: 1.6,
};

export default function ArcReactor({
  state = 'idle',
  amplitude,
  size = 320,
  className,
}: ArcReactorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Live props, read inside the rAF loop without restarting it.
  const propsRef = useRef({ state, amplitude });
  propsRef.current = { state, amplitude };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina-sharp: render at devicePixelRatio, draw in CSS px.
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - 6; // reactor radius, small inset for glow

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let start = 0;

    const drawRing = (ring: Ring, rot: number, alpha: number) => {
      const radius = R * ring.r;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.lineCap = 'round';
      ctx.lineWidth = ring.width;
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = ring.color;
      ctx.shadowBlur = ring.glow;
      for (const [sFrac, lenFrac] of ring.segments) {
        const a0 = sFrac * Math.PI * 2;
        const a1 = (sFrac + lenFrac) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, radius, a0, a1);
        ctx.stroke();
      }
      ctx.restore();
    };

    const render = (t: number) => {
      if (!start) start = t;
      const elapsed = (t - start) / 1000; // seconds
      const { state: st, amplitude: amp } = propsRef.current;

      // Breathing pulse 0..1. If a live amplitude is provided (Phase 3) use it;
      // otherwise synthesize a gentle sine so the core always feels alive.
      const breathing = 0.5 + 0.5 * Math.sin(elapsed * 1.4);
      const pulse = typeof amp === 'number' && amp > 0.001 ? Math.min(amp, 1) : breathing * 0.55;

      const speedMul = SPEED_BY_STATE[st] ?? 1;

      ctx.clearRect(0, 0, size, size);

      // Soft radial backdrop glow behind the reactor.
      const bg = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
      bg.addColorStop(0, 'rgba(124, 58, 237, 0.16)');
      bg.addColorStop(0.6, 'rgba(219, 39, 119, 0.06)');
      bg.addColorStop(1, 'rgba(13, 8, 32, 0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // Rotating rings.
      for (const ring of RINGS) {
        const rot = elapsed * ring.speed * speedMul;
        drawRing(ring, rot, 0.9);
      }

      // Faint full circle "track" for cohesion.
      ctx.save();
      ctx.strokeStyle = 'rgba(168, 130, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Pulsing core. Radius breathes; brighter when speaking / loud.
      const coreBase = R * 0.2;
      const coreR = coreBase * (1 + pulse * 0.35);
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.8);
      core.addColorStop(0, `rgba(255, 255, 255, ${0.85 + pulse * 0.15})`);
      core.addColorStop(0.3, `rgba(236, 130, 255, ${0.7 + pulse * 0.2})`);
      core.addColorStop(0.6, 'rgba(219, 39, 119, 0.55)');
      core.addColorStop(1, 'rgba(124, 58, 237, 0)');
      ctx.save();
      ctx.shadowColor = PINK;
      ctx.shadowBlur = 24 + pulse * 28;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 1.8, 0, Math.PI * 2);
      ctx.fill();
      // Bright center dot.
      ctx.shadowBlur = 12;
      ctx.fillStyle = `rgba(255,255,255,${0.9})`;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (!reduceMotion) {
        rafId = requestAnimationFrame(render);
      }
    };

    if (reduceMotion) {
      // Single static frame — no animation loop.
      render(0);
    } else {
      rafId = requestAnimationFrame(render);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Pontifex Command Center reactor"
      className={className}
      style={{ width: size, height: size, display: 'block' }}
    />
  );
}
