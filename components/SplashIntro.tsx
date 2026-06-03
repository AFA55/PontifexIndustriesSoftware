'use client';

/**
 * SplashIntro — the polished, premium launch animation.
 *
 * Recreates the APPROVED design from `assets/logo-concepts/splash-demo-v4.html`
 * (the "purple→red journey" bridge-"P"): aurora background, a self-drawing
 * bridge stroke, a data-pulse that travels across the span lighting circuit
 * nodes, a blueprint grid, then the "Pontifex Industries" wordmark reveal.
 *
 * Purpose: the native iOS splash shows a static "P" on #1e1b4b, then hands off
 * to the web. This overlay STARTS on the same #1e1b4b background and animates
 * from a centered "P" so the native→web handoff is seamless — no flash, no snap.
 *
 * Behavior:
 *  - Full-screen fixed overlay, GPU-friendly transforms only, ~2.6s sequence.
 *  - Plays ONCE per app launch — guarded by sessionStorage('pontifex_intro_shown')
 *    so it does NOT replay on client-side navigations, only on a fresh load.
 *  - Honors prefers-reduced-motion (instant content, brief fade, no heavy motion).
 *  - Non-blocking: it's pointer-events:none on the login beneath it, and a
 *    hard 3s safety timer always dismisses it even if an animation stalls.
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'pontifex_intro_shown';

// Total time the overlay stays mounted before it begins fading out.
// Matches the v4 timeline: bridge draw → pulse → wordmark settle ≈ 2.6s.
const HOLD_MS = 2600;
// Fade/scale-out duration once the sequence finishes.
const FADE_MS = 600;
// Absolute safety net — never trap the user behind the overlay.
const MAX_MS = 3000;

export default function SplashIntro() {
  // `null` until we've decided (avoids SSR/first-paint flash of the overlay
  // on pages where it should not show).
  const [show, setShow] = useState<boolean | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // Once-per-launch guard. sessionStorage is cleared when the app/tab process
    // is killed, so a fresh native launch (or fresh browser session) replays it,
    // but in-app route changes within the same session do not.
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // sessionStorage can throw in some privacy modes — fail open (show once).
    }

    if (alreadyShown) {
      setShow(false);
      return;
    }

    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setReduced(!!prefersReduced);
    setShow(true);

    const hold = prefersReduced ? 350 : HOLD_MS;
    const fade = prefersReduced ? 200 : FADE_MS;

    // Begin the exit fade after the sequence completes.
    const leaveTimer = window.setTimeout(() => setLeaving(true), hold);
    // Unmount after the fade.
    const doneTimer = window.setTimeout(() => setShow(false), hold + fade);
    // Hard safety net — always gone within MAX_MS regardless of timers above.
    const safety = window.setTimeout(() => setShow(false), Math.max(MAX_MS, hold + fade));

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(doneTimer);
      window.clearTimeout(safety);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      aria-hidden="true"
      className="pontifex-splash-overlay"
      data-leaving={leaving ? 'true' : 'false'}
      data-reduced={reduced ? 'true' : 'false'}
    >
      {/* Aurora blobs — purple / magenta / red, matching v4 */}
      {!reduced && (
        <>
          <div className="ps-blob ps-b1" />
          <div className="ps-blob ps-b2" />
          <div className="ps-blob ps-b3" />
          <div className="ps-blob ps-b4" />
          {/* Tech blueprint grid, masked to fade at the edges */}
          <div className="ps-grid" />
        </>
      )}

      <div className="ps-lockup">
        <div className="ps-markwrap">
          <div className="ps-glow" />
          <svg className="ps-mark" viewBox="0 0 200 200" aria-label="Pontifex Industries">
            <defs>
              <linearGradient
                id="psJourney"
                x1="0"
                y1="1"
                x2="1"
                y2="0"
                gradientUnits="objectBoundingBox"
              >
                <stop offset="0" stopColor="#7C3AED" />
                <stop offset="0.5" stopColor="#DB2777" />
                <stop offset="1" stopColor="#EF4444" />
              </linearGradient>
              <filter id="psWarmGlow" x="-120%" y="-120%" width="340%" height="340%">
                <feGaussianBlur stdDeviation="3.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* The self-drawing bridge-"P" — same path + gradient as public/logo.svg */}
            <path
              id="psBridge"
              className="ps-bridge"
              transform="translate(-5,-2)"
              pathLength={1}
              d="M70,160 L70,44 L108,44 A32 32 0 0 1 108,108 L70,108"
            />
            {/* Flash overlay when the pulse arrives ("energize") */}
            <path
              className="ps-energize"
              transform="translate(-5,-2)"
              d="M70,160 L70,44 L108,44 A32 32 0 0 1 108,108 L70,108"
            />

            {!reduced && (
              <>
                {/* Circuit nodes that pop as the pulse passes */}
                <g transform="translate(-5,-2)" filter="url(#psWarmGlow)">
                  <circle id="psN1" className="ps-node" cx="70" cy="160" r="6.5" fill="#FCA5A5" />
                  <circle id="psN2" className="ps-node" cx="70" cy="44" r="6" fill="#F5D0FE" />
                  <circle id="psN3" className="ps-node" cx="135" cy="76" r="6.5" fill="#FBCFE8" />
                </g>
                {/* Data pulse traveling across the span */}
                <g transform="translate(-5,-2)">
                  <circle className="ps-pulse" r="5.5" fill="#FFFFFF" filter="url(#psWarmGlow)">
                    <animate
                      attributeName="opacity"
                      begin="1.3s"
                      dur="1s"
                      values="0;1;1;0"
                      keyTimes="0;0.12;0.82;1"
                      fill="freeze"
                    />
                    <animateMotion
                      begin="1.3s"
                      dur="1s"
                      fill="freeze"
                      calcMode="spline"
                      keyTimes="0;1"
                      keySplines="0.5 0 0.3 1"
                    >
                      <mpath href="#psBridge" />
                    </animateMotion>
                  </circle>
                </g>
              </>
            )}
          </svg>
        </div>

        <div className="ps-word">
          <div className="ps-pontifex">Pontifex</div>
          <div className="ps-industries">Industries</div>
        </div>
      </div>

      <style jsx>{`
        .pontifex-splash-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          /* Seamless handoff from the native splash (#1e1b4b). */
          background: #1e1b4b;
          display: grid;
          place-items: center;
          overflow: hidden;
          /* Decorative only — never trap taps on the login underneath. */
          pointer-events: none;
          opacity: 1;
          transition: opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease;
          will-change: opacity, transform;
        }
        .pontifex-splash-overlay[data-leaving='true'] {
          opacity: 0;
          transform: scale(1.04);
        }
        .pontifex-splash-overlay[data-reduced='true'] {
          transition: opacity 200ms ease;
        }
        .pontifex-splash-overlay[data-reduced='true'][data-leaving='true'] {
          transform: none;
        }

        /* Aurora blobs */
        .ps-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(48px);
          opacity: 0.5;
          mix-blend-mode: screen;
          will-change: transform;
        }
        .ps-b1 {
          width: 42vmin;
          height: 42vmin;
          background: #7c3aed;
          top: -8vmin;
          left: -8vmin;
          animation: psF1 10s ease-in-out infinite;
        }
        .ps-b2 {
          width: 38vmin;
          height: 38vmin;
          background: #a21caf;
          top: 22vmin;
          left: 14vmin;
          animation: psF2 12s ease-in-out infinite;
        }
        .ps-b3 {
          width: 40vmin;
          height: 40vmin;
          background: #ef4444;
          bottom: -8vmin;
          right: -8vmin;
          opacity: 0.45;
          animation: psF3 11s ease-in-out infinite;
        }
        .ps-b4 {
          width: 28vmin;
          height: 28vmin;
          background: #db2777;
          top: 8vmin;
          right: -4vmin;
          opacity: 0.32;
          animation: psF4 14s ease-in-out infinite;
        }
        @keyframes psF1 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(28px, 38px) scale(1.15);
          }
        }
        @keyframes psF2 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(-22px, 28px) scale(1.1);
          }
        }
        @keyframes psF3 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(-28px, -28px) scale(1.18);
          }
        }
        @keyframes psF4 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(-18px, 36px) scale(1.2);
          }
        }

        /* Blueprint grid, masked to fade at edges */
        .ps-grid {
          position: absolute;
          inset: 0;
          opacity: 0;
          background-image: linear-gradient(rgba(244, 114, 182, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(244, 114, 182, 0.1) 1px, transparent 1px);
          background-size: 28px 28px;
          -webkit-mask: radial-gradient(circle at 50% 44%, #000 0%, transparent 70%);
          mask: radial-gradient(circle at 50% 44%, #000 0%, transparent 70%);
          animation: psGridIn 1.4s ease 0.3s forwards;
        }
        @keyframes psGridIn {
          to {
            opacity: 0.55;
          }
        }

        /* Lockup (mark + wordmark) */
        .ps-lockup {
          position: relative;
          z-index: 5;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 22px;
          transform: translateY(20px);
          animation: psSettle 1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.75s forwards;
        }
        .ps-markwrap {
          position: relative;
          width: 120px;
          height: 120px;
          display: grid;
          place-items: center;
        }
        .ps-glow {
          position: absolute;
          width: 128px;
          height: 128px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(168, 28, 175, 0.5),
            rgba(239, 68, 68, 0.24) 48%,
            transparent 72%
          );
          filter: blur(13px);
          opacity: 0;
          transform: scale(0.6);
          will-change: opacity, transform;
          animation: psBloom 1.1s ease 0.9s forwards;
        }
        .ps-mark {
          width: 112px;
          height: 112px;
          position: relative;
          z-index: 2;
          overflow: visible;
        }

        .ps-bridge {
          fill: none;
          stroke: url(#psJourney);
          stroke-width: 18;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: psDraw 1.05s cubic-bezier(0.6, 0, 0.2, 1) 0.2s forwards;
        }
        .ps-energize {
          fill: none;
          stroke: #fecdd3;
          stroke-width: 18;
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: 0;
          animation: psFlash 0.5s ease 2.25s 1;
        }
        .ps-node {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
        }
        .ps-pulse {
          opacity: 0;
        }

        /* Node pops timed to the pulse crossing */
        :global(#psN1) {
          animation: psNodePop 0.5s ease 1.35s forwards;
        }
        :global(#psN2) {
          animation: psNodePop 0.5s ease 1.75s forwards;
        }
        :global(#psN3) {
          animation: psNodePop 0.5s ease 2.15s forwards;
        }

        /* Wordmark */
        .ps-word {
          text-align: center;
        }
        .ps-pontifex {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
          font-weight: 700;
          font-size: 31px;
          letter-spacing: -0.01em;
          opacity: 0;
          filter: blur(10px);
          transform: translateY(14px);
          background: linear-gradient(100deg, #fff, #fbcfe8 60%, #fff);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: psRise 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) 1.5s forwards;
        }
        .ps-industries {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
          margin-top: 9px;
          font-weight: 600;
          font-size: 11px;
          letter-spacing: 0.46em;
          text-transform: uppercase;
          opacity: 0;
          filter: blur(8px);
          transform: translateY(10px);
          background: linear-gradient(90deg, #9333ea, #db2777 55%, #ef4444);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: psRise 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) 1.75s forwards;
        }

        @keyframes psDraw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes psBloom {
          0% {
            opacity: 0;
            transform: scale(0.6);
          }
          55% {
            opacity: 1;
            transform: scale(1.12);
          }
          100% {
            opacity: 0.78;
            transform: scale(1);
          }
        }
        @keyframes psSettle {
          to {
            transform: translateY(0);
          }
        }
        @keyframes psFlash {
          0% {
            opacity: 0;
          }
          40% {
            opacity: 0.85;
          }
          100% {
            opacity: 0;
          }
        }
        @keyframes psRise {
          to {
            opacity: 1;
            filter: blur(0);
            transform: translateY(0);
          }
        }
        @keyframes psNodePop {
          0% {
            opacity: 0;
            transform: scale(0);
          }
          60% {
            opacity: 1;
            transform: scale(1.6);
          }
          100% {
            opacity: 0.95;
            transform: scale(1);
          }
        }

        /* prefers-reduced-motion: show the final state instantly, just fade out. */
        @media (prefers-reduced-motion: reduce) {
          .ps-lockup {
            transform: none;
            animation: none;
          }
          .ps-glow {
            opacity: 0.78;
            transform: scale(1);
            animation: none;
          }
          .ps-bridge {
            stroke-dashoffset: 0;
            animation: none;
          }
          .ps-energize {
            animation: none;
          }
          .ps-pontifex,
          .ps-industries {
            opacity: 1;
            filter: blur(0);
            transform: none;
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
