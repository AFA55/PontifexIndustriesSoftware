'use client';

import { useEffect, useRef } from 'react';

/**
 * NeuralBrain — the Command Center centerpiece (replaces ArcReactor).
 *
 * A vanilla <canvas> 2D radial node network: a bright core with satellite nodes
 * scattered at varying distances/angles (seeded, not a perfect ring — reads as
 * a star-map / "second brain" rather than a mechanical reactor), thin connecting
 * lines, and pulses that travel along a subset of edges. Colors follow the
 * Pontifex journey gradient (violet -> pink -> red) over a near-black backdrop.
 *
 * WHY CANVAS: same reasoning as the component this replaces (ArcReactor) — many
 * small elements repainted every frame is cheaper as one canvas surface than as
 * animated DOM/SVG nodes.
 *
 * STATE CONTRACT (kept identical to ArcReactor so callers swap in directly):
 *   - `state`: idle | listening | thinking | speaking
 *       idle      -> slow ambient drift, sparse pulses
 *       listening -> nodes brighten slightly, pulses a bit more frequent
 *       thinking  -> pulse rate + travel speed both increase, lines animate harder
 *       speaking  -> core + first-ring nodes breathe in sync with `amplitude`
 *   - `amplitude` (0..1): live voice loudness for Phase 3. Undefined -> a soft
 *     internal sine substitutes so the network always feels alive.
 *
 * Props are read through a ref inside the rAF loop so changing `state`/`amplitude`
 * never restarts the animation.
 *
 * Respects prefers-reduced-motion: renders a single static frame, no rAF loop.
 */

export type NeuralBrainState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface NeuralBrainProps {
  state?: NeuralBrainState;
  /** Live voice amplitude 0..1 (Phase 3). Phase 1 leaves this undefined. */
  amplitude?: number;
  /** Rendered pixel size (square). Defaults to 320. */
  size?: number;
  className?: string;
}

const VIOLET = '#7C3AED';
const PINK = '#DB2777';
const RED = '#EF4444';
const PALETTE = [VIOLET, PINK, RED];

interface Node {
  ring: number; // 0 = closest to core
  angle: number; // radians, static base position
  radiusFrac: number; // fraction of R
  size: number;
  color: string;
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
  const ringRadii = [0.32, 0.62, 0.94];

  ringCounts.forEach((count, ring) => {
    const baseRadius = ringRadii[ring];
    for (let i = 0; i < count; i++) {
      const jitterAngle = (rand() - 0.5) * (Math.PI / count) * 0.7;
      const angle = (i / count) * Math.PI * 2 + jitterAngle;
      const radiusFrac = baseRadius + (rand() - 0.5) * 0.08;
      nodes.push({
        ring,
        angle,
        radiusFrac,
        size: ring === 0 ? 3.2 + rand() * 1.6 : 1.6 + rand() * 2.2,
        color: PALETTE[Math.floor(rand() * PALETTE.length)],
        driftPhase: rand() * Math.PI * 2,
        driftAmp: 0.015 + rand() * 0.02,
      });
    }
  });

  const edges: Edge[] = [];
  // Core -> every ring-0 node.
  nodes.forEach((n, i) => {
    if (n.ring === 0) {
      edges.push({ a: -1, b: i, pulseOffset: rand(), pulseSpeed: 0.35 + rand() * 0.25, active: true });
    }
  });
  // Connect each node to its nearest neighbor(s) in the ring inward, plus a
  // couple of lateral neighbors within the same ring for a web-like feel.
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
  // Lateral connections within the outer two rings (sparse, for the web look).
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
  thinking: 2.2,
  speaking: 1.5,
};

const PULSE_DENSITY_BY_STATE: Record<NeuralBrainState, number> = {
  idle: 0.35,
  listening: 0.55,
  thinking: 1,
  speaking: 0.7,
};

export default function NeuralBrain({
  state = 'idle',
  amplitude,
  size = 320,
  className,
}: NeuralBrainProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({ state, amplitude });
  propsRef.current = { state, amplitude };

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

    let rafId = 0;
    let start = 0;

    const render = (t: number) => {
      if (!start) start = t;
      const elapsed = (t - start) / 1000;
      const { state: st, amplitude: amp } = propsRef.current;

      const breathing = 0.5 + 0.5 * Math.sin(elapsed * 1.4);
      const pulse = typeof amp === 'number' && amp > 0.001 ? Math.min(amp, 1) : breathing * 0.55;
      const speedMul = SPEED_BY_STATE[st] ?? 1;
      const density = PULSE_DENSITY_BY_STATE[st] ?? 0.5;

      ctx.clearRect(0, 0, size, size);

      // Near-black radial backdrop with a faint brand-tinted core glow.
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
      bg.addColorStop(0, 'rgba(124, 58, 237, 0.18)');
      bg.addColorStop(0.35, 'rgba(30, 10, 40, 0.35)');
      bg.addColorStop(1, 'rgba(3, 2, 8, 0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2);
      ctx.fill();

      const corePos = { x: cx, y: cy };

      // Edges (drawn first, under nodes).
      for (const edge of edges) {
        const pa = edge.a === -1 ? corePos : nodePos(nodes[edge.a], elapsed);
        const pb = nodePos(nodes[edge.b], elapsed);
        ctx.save();
        ctx.strokeStyle = 'rgba(180, 150, 255, 0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
        ctx.restore();

        if (!edge.active) continue;
        const travel = (elapsed * edge.pulseSpeed * speedMul + edge.pulseOffset) % 1;
        if (travel > density) continue; // sparser at low density states
        const px = pa.x + (pb.x - pa.x) * travel;
        const py = pa.y + (pb.y - pa.y) * travel;
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = PINK;
        ctx.shadowBlur = 8;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Nodes.
      for (const n of nodes) {
        const p = nodePos(n, elapsed);
        const isInner = n.ring === 0;
        const glow = isInner ? 10 + pulse * 10 : 5;
        const radius = n.size * (isInner ? 1 + pulse * 0.4 : 1);
        ctx.save();
        ctx.shadowColor = n.color;
        ctx.shadowBlur = glow;
        ctx.fillStyle = isInner ? '#ffffff' : n.color;
        ctx.globalAlpha = isInner ? 0.95 : 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Core.
      const coreR = R * 0.11 * (1 + pulse * 0.4);
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2);
      core.addColorStop(0, `rgba(255, 255, 255, ${0.9 + pulse * 0.1})`);
      core.addColorStop(0.35, `rgba(236, 130, 255, ${0.65 + pulse * 0.25})`);
      core.addColorStop(0.65, 'rgba(219, 39, 119, 0.5)');
      core.addColorStop(1, 'rgba(124, 58, 237, 0)');
      ctx.save();
      ctx.shadowColor = PINK;
      ctx.shadowBlur = 26 + pulse * 30;
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
