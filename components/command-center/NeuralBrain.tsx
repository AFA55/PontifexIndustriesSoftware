'use client';

import { useEffect, useRef } from 'react';

/**
 * NeuralBrain v2 — the Command Center centerpiece, redesigned Jul 9 as the
 * VOICE AVATAR (founder: "it should look like the center is talking").
 *
 * Visual language (Jarvis HUD school — rotating orbital arcs, radial tick
 * gauge, radar sweep, audio-reactive core) over the node-network "second
 * brain" web. Palette moved off the purple/pink journey gradient to the
 * midnight-steel + crimson ops palette (founder: purple read unprofessional
 * here; steel/crimson also matches Patriot red/navy):
 *   idle      -> steel blue, slow drift, sparse pulses
 *   listening -> ice blue brightens + a radar sweep arc orbits
 *   thinking  -> white-hot core, pulses race
 *   speaking  -> CRIMSON everything; core + rings breathe with the live
 *                ElevenLabs amplitude (getAmplitude, read inside rAF — zero
 *                React re-renders per frame)
 *
 * WHY CANVAS: many small elements repainted every frame is cheaper as one
 * canvas surface than as animated DOM/SVG nodes.
 *
 * STATE CONTRACT (unchanged from v1 so callers swap in directly):
 *   - `state`: idle | listening | thinking | speaking
 *   - `amplitude` (0..1) OR `getAmplitude()` for per-frame live loudness.
 *
 * Props are read through a ref inside the rAF loop so changing them never
 * restarts the animation. Respects prefers-reduced-motion (static frame).
 */

export type NeuralBrainState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface NeuralBrainProps {
  state?: NeuralBrainState;
  /** Live voice amplitude 0..1. */
  amplitude?: number;
  /** Preferred: per-frame amplitude getter (read inside the rAF loop). */
  getAmplitude?: () => number;
  /** Rendered pixel size (square). Defaults to 320. */
  size?: number;
  className?: string;
}

// Midnight-steel ops palette.
const STEEL = '#38BDF8'; // sky-400
const ICE = '#7DD3FC'; // sky-300
const CRIMSON = '#EF4444';
const DEEP_RED = '#DC2626';
const NODE_PALETTE = [STEEL, ICE, '#60A5FA']; // steel family; crimson is reserved for voice

interface Node {
  ring: number; // 0 = closest to core
  angle: number; // radians, static base position
  radiusFrac: number; // fraction of R
  size: number;
  colorIdx: number;
  driftPhase: number;
  driftAmp: number;
}

interface Edge {
  a: number; // node index (or -1 for core)
  b: number;
  pulseOffset: number;
  pulseSpeed: number;
  active: boolean;
}

// Deterministic pseudo-random so the layout is stable across renders/reloads.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildNetwork(): { nodes: Node[]; edges: Edge[] } {
  const rand = mulberry32(42);
  const nodes: Node[] = [];
  const ringCounts = [7, 11, 14];
  const ringRadii = [0.3, 0.55, 0.78];

  ringCounts.forEach((count, ring) => {
    const baseRadius = ringRadii[ring];
    for (let i = 0; i < count; i++) {
      const jitterAngle = (rand() - 0.5) * (Math.PI / count) * 0.7;
      const angle = (i / count) * Math.PI * 2 + jitterAngle;
      const radiusFrac = baseRadius + (rand() - 0.5) * 0.07;
      nodes.push({
        ring,
        angle,
        radiusFrac,
        size: ring === 0 ? 3 + rand() * 1.4 : 1.4 + rand() * 2,
        colorIdx: Math.floor(rand() * NODE_PALETTE.length),
        driftPhase: rand() * Math.PI * 2,
        driftAmp: 0.013 + rand() * 0.018,
      });
    }
  });

  const edges: Edge[] = [];
  nodes.forEach((n, i) => {
    if (n.ring === 0) {
      edges.push({ a: -1, b: i, pulseOffset: rand(), pulseSpeed: 0.35 + rand() * 0.25, active: true });
    }
  });
  nodes.forEach((n, i) => {
    if (n.ring === 0) return;
    let bestJ = -1;
    let bestD = Infinity;
    nodes.forEach((m, j) => {
      if (j === i || m.ring !== n.ring - 1) return;
      const d = Math.abs(angleDiff(n.angle, m.angle));
      if (d < bestD) {
        bestD = d;
        bestJ = j;
      }
    });
    if (bestJ >= 0) {
      edges.push({ a: bestJ, b: i, pulseOffset: rand(), pulseSpeed: 0.3 + rand() * 0.3, active: rand() > 0.35 });
    }
  });
  for (let ring = 1; ring <= 2; ring++) {
    const ringNodes = nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.ring === ring);
    ringNodes.forEach(({ i }, idx) => {
      if (rand() > 0.55) return;
      const next = ringNodes[(idx + 1) % ringNodes.length];
      if (next && next.i !== i) {
        edges.push({ a: i, b: next.i, pulseOffset: rand(), pulseSpeed: 0.25 + rand() * 0.2, active: rand() > 0.6 });
      }
    });
  }

  return { nodes, edges };
}

function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const NETWORK = buildNetwork();

const SPEED_BY_STATE: Record<NeuralBrainState, number> = {
  idle: 1,
  listening: 1.3,
  thinking: 2.4,
  speaking: 1.6,
};

const PULSE_DENSITY_BY_STATE: Record<NeuralBrainState, number> = {
  idle: 0.35,
  listening: 0.55,
  thinking: 1,
  speaking: 0.8,
};

/** Per-state accent used by the HUD rings / glow / pulses. */
const ACCENT_BY_STATE: Record<NeuralBrainState, { main: string; glow: string; rgb: string }> = {
  idle: { main: STEEL, glow: STEEL, rgb: '56, 189, 248' },
  listening: { main: ICE, glow: ICE, rgb: '125, 211, 252' },
  thinking: { main: '#E2E8F0', glow: ICE, rgb: '226, 232, 240' },
  speaking: { main: CRIMSON, glow: DEEP_RED, rgb: '239, 68, 68' },
};

export default function NeuralBrain({
  state = 'idle',
  amplitude,
  getAmplitude,
  size = 320,
  className,
}: NeuralBrainProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({ state, amplitude, getAmplitude });
  propsRef.current = { state, amplitude, getAmplitude };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - 8;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const { nodes, edges } = NETWORK;

    const nodePos = (n: Node, elapsed: number) => {
      const drift = Math.sin(elapsed * 0.5 + n.driftPhase) * n.driftAmp;
      const r = R * (n.radiusFrac + drift);
      return { x: cx + Math.cos(n.angle) * r, y: cy + Math.sin(n.angle) * r };
    };

    // Smoothed amplitude so the core doesn't jitter frame-to-frame.
    let smoothAmp = 0;

    let rafId = 0;
    let start = 0;

    const render = (t: number) => {
      if (!start) start = t;
      const elapsed = (t - start) / 1000;
      const { state: st, amplitude: ampProp, getAmplitude: getAmp } = propsRef.current;
      const accent = ACCENT_BY_STATE[st] ?? ACCENT_BY_STATE.idle;

      const liveAmp = getAmp ? getAmp() : typeof ampProp === 'number' ? ampProp : 0;
      const breathing = 0.5 + 0.5 * Math.sin(elapsed * 1.4);
      const target = liveAmp > 0.02 ? Math.min(liveAmp, 1) : breathing * (st === 'speaking' ? 0.6 : 0.5);
      smoothAmp += (target - smoothAmp) * 0.25;
      const pulse = smoothAmp;

      const speedMul = SPEED_BY_STATE[st] ?? 1;
      const density = PULSE_DENSITY_BY_STATE[st] ?? 0.5;
      const speakingHot = st === 'speaking';

      ctx.clearRect(0, 0, size, size);

      // Near-black radial backdrop tinted by the state accent.
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
      bg.addColorStop(0, `rgba(${accent.rgb}, ${0.12 + pulse * 0.06})`);
      bg.addColorStop(0.35, 'rgba(8, 15, 30, 0.35)');
      bg.addColorStop(1, 'rgba(2, 4, 9, 0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2);
      ctx.fill();

      // ── HUD chrome ────────────────────────────────────────────────────────
      // Outer boundary ring.
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.99, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Radial tick gauge on the outer ring (every 6°, every 5th tick longer).
      ctx.save();
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const long = i % 5 === 0;
        const r0 = R * (long ? 0.935 : 0.955);
        const r1 = R * 0.985;
        ctx.strokeStyle = long ? `rgba(${accent.rgb}, 0.35)` : 'rgba(148, 163, 184, 0.16)';
        ctx.lineWidth = long ? 1.4 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();

      // Two counter-rotating dashed orbital arcs.
      const drawOrbit = (radiusFrac: number, rotation: number, dash: number[], alpha: number, width: number) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);
        ctx.strokeStyle = `rgba(${accent.rgb}, ${alpha})`;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.arc(0, 0, R * radiusFrac, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      };
      drawOrbit(0.88, elapsed * 0.18 * speedMul, [size * 0.16, size * 0.08], 0.3 + pulse * 0.2, 1.4);
      drawOrbit(0.66, -elapsed * 0.26 * speedMul, [size * 0.05, size * 0.05], 0.22 + pulse * 0.18, 1);

      // Radar sweep while LISTENING — a bright leading arc that orbits.
      if (st === 'listening') {
        const sweepA = elapsed * 1.6;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(sweepA);
        const grad = ctx.createLinearGradient(R * 0.9, 0, R * 0.9 * Math.cos(0.5), R * 0.9 * Math.sin(0.5));
        grad.addColorStop(0, `rgba(${accent.rgb}, 0.85)`);
        grad.addColorStop(1, `rgba(${accent.rgb}, 0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.4;
        ctx.shadowColor = accent.glow;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.9, 0, 0.55);
        ctx.stroke();
        ctx.restore();
      }

      const corePos = { x: cx, y: cy };

      // ── Node web ─────────────────────────────────────────────────────────
      for (const edge of edges) {
        const pa = edge.a === -1 ? corePos : nodePos(nodes[edge.a], elapsed);
        const pb = nodePos(nodes[edge.b], elapsed);
        ctx.save();
        ctx.strokeStyle = speakingHot ? 'rgba(248, 113, 113, 0.14)' : 'rgba(125, 211, 252, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
        ctx.restore();

        if (!edge.active) continue;
        const travel = (elapsed * edge.pulseSpeed * speedMul + edge.pulseOffset) % 1;
        if (travel > density) continue;
        const px = pa.x + (pb.x - pa.x) * travel;
        const py = pa.y + (pb.y - pa.y) * travel;
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = accent.main;
        ctx.shadowBlur = 8;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const n of nodes) {
        const p = nodePos(n, elapsed);
        const isInner = n.ring === 0;
        const glow = isInner ? 10 + pulse * 10 : 5;
        const radius = n.size * (isInner ? 1 + pulse * 0.4 : 1);
        const color = speakingHot && (isInner || n.colorIdx === 0) ? CRIMSON : NODE_PALETTE[n.colorIdx];
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = glow;
        ctx.fillStyle = isInner ? '#ffffff' : color;
        ctx.globalAlpha = isInner ? 0.95 : 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ── Core — the "mouth" of the voice: driven by live amplitude ────────
      const coreR = R * 0.115 * (1 + pulse * 0.55);
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2);
      if (speakingHot) {
        core.addColorStop(0, `rgba(255, 255, 255, ${0.92 + pulse * 0.08})`);
        core.addColorStop(0.35, `rgba(252, 165, 165, ${0.6 + pulse * 0.3})`);
        core.addColorStop(0.65, 'rgba(220, 38, 38, 0.5)');
        core.addColorStop(1, 'rgba(127, 29, 29, 0)');
      } else {
        core.addColorStop(0, `rgba(255, 255, 255, ${0.9 + pulse * 0.1})`);
        core.addColorStop(0.35, `rgba(186, 230, 253, ${0.6 + pulse * 0.25})`);
        core.addColorStop(0.65, 'rgba(56, 189, 248, 0.45)');
        core.addColorStop(1, 'rgba(14, 116, 178, 0)');
      }
      ctx.save();
      ctx.shadowColor = accent.glow;
      ctx.shadowBlur = 26 + pulse * 34;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Amplitude halo ring while speaking — the visible "talking" cue.
      if (speakingHot) {
        ctx.save();
        ctx.strokeStyle = `rgba(${accent.rgb}, ${0.25 + pulse * 0.45})`;
        ctx.lineWidth = 1.6 + pulse * 2.2;
        ctx.shadowColor = accent.glow;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR * 2.6 + pulse * R * 0.09, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (!reduceMotion) {
        rafId = requestAnimationFrame(render);
      }
    };

    if (reduceMotion) {
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
      aria-label="Artifex neural network"
      className={className}
      style={{ width: size, height: size, display: 'block' }}
    />
  );
}
