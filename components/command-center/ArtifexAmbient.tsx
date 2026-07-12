'use client';

import { useEffect, useRef } from 'react';

/**
 * ArtifexAmbient — full-page "2nd brain" backdrop for the Artifex room
 * (founder Jul 11: "have the thing that looks like a 2nd brain in the
 * background so it looks like it's connecting dots and opening files").
 *
 * A fixed, pointer-events-none canvas behind the content: ~70 dim steel
 * nodes drifting slowly, proximity-linked lines, and occasional bright
 * "data packets" that travel an edge and briefly ignite the destination
 * node (the connecting-dots / opening-files feel). Deliberately quiet —
 * ambience, not spectacle; the orb stays the hero.
 *
 * Perf: one canvas, one rAF, capped node count, distance grid skipped in
 * favor of O(n²) over 70 nodes (≈2.5k checks — trivial). Respects
 * prefers-reduced-motion (renders a single static frame).
 */
export default function ArtifexAmbient({
  className,
  mode = 'dark',
}: {
  className?: string;
  /** light = deep-slate ink on the clean-room theme; dark = steel glow. */
  mode?: 'light' | 'dark';
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const darkMode = mode === 'dark';
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const N = 70;
    const LINK_DIST = 170;
    const nodes = Array.from({ length: N }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      r: 1 + Math.random() * 1.6,
      glow: 0, // ignition level, decays after a packet arrives
    }));

    interface Packet { a: number; b: number; t: number; speed: number }
    const packets: Packet[] = [];

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    const render = () => {
      ctx.clearRect(0, 0, w, h);

      // Drift
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;
        n.glow *= 0.96;
      }

      // Links
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK_DIST * LINK_DIST) {
            const alpha = (darkMode ? 0.05 : 0.09) * (1 - Math.sqrt(d2) / LINK_DIST);
            ctx.strokeStyle = darkMode ? `rgba(125, 211, 252, ${alpha})` : `rgba(51, 65, 85, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Spawn a data packet now and then along a random short edge.
      if (!reduceMotion && packets.length < 4 && Math.random() < 0.02) {
        const a = Math.floor(Math.random() * N);
        let best = -1;
        let bestD = Infinity;
        for (let j = 0; j < N; j++) {
          if (j === a) continue;
          const dx = nodes[a].x - nodes[j].x;
          const dy = nodes[a].y - nodes[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD) { bestD = d2; best = j; }
        }
        if (best >= 0 && bestD < 260 * 260) {
          packets.push({ a, b: best, t: 0, speed: 0.008 + Math.random() * 0.01 });
        }
      }

      // Packets
      for (let k = packets.length - 1; k >= 0; k--) {
        const p = packets[k];
        p.t += p.speed;
        if (p.t >= 1) {
          nodes[p.b].glow = 1; // destination ignites — "file opened"
          packets.splice(k, 1);
          continue;
        }
        const x = nodes[p.a].x + (nodes[p.b].x - nodes[p.a].x) * p.t;
        const y = nodes[p.a].y + (nodes[p.b].y - nodes[p.a].y) * p.t;
        ctx.save();
        ctx.fillStyle = darkMode ? 'rgba(255,255,255,0.9)' : 'rgba(2,132,199,0.95)';
        ctx.shadowColor = '#38BDF8';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Nodes
      for (const n of nodes) {
        ctx.save();
        const ignited = n.glow > 0.05;
        ctx.fillStyle = ignited
          ? (darkMode ? `rgba(186, 230, 253, ${0.5 + n.glow * 0.5})` : `rgba(2, 132, 199, ${0.55 + n.glow * 0.45})`)
          : (darkMode ? 'rgba(125, 211, 252, 0.35)' : 'rgba(71, 85, 105, 0.35)');
        if (ignited) {
          ctx.shadowColor = '#7DD3FC';
          ctx.shadowBlur = 10 * n.glow;
        }
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * (1 + n.glow * 0.8), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (!reduceMotion) rafId = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none fixed inset-0 opacity-40 ${className ?? ''}`}
    />
  );
}
