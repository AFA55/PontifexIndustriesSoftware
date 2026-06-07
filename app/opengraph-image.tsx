import { ImageResponse } from 'next/og';

// Branded Open Graph image (1200×630) — purple→fuchsia→rose journey gradient
// with the Pontifex bridge-P mark and the lead tagline.
export const runtime = 'edge';
export const alt =
  'Pontifex Industries — Custom software and AI automations built around how you work';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          background:
            'linear-gradient(135deg, #0b0612 0%, #1a0b2e 45%, #2a0d24 100%)',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Brand wordmark + bridge-P */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <svg width="72" height="72" viewBox="0 0 200 200">
            <defs>
              <linearGradient id="og" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#7C3AED" />
                <stop offset="0.5" stopColor="#DB2777" />
                <stop offset="1" stopColor="#EF4444" />
              </linearGradient>
            </defs>
            <g
              transform="translate(-5,-2)"
              fill="none"
              stroke="url(#og)"
              strokeWidth="17"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M70,160 L70,44 L108,44 A32 32 0 0 1 108,108 L70,108" />
            </g>
          </svg>
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
            Pontifex Industries
          </span>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05, maxWidth: 1000 }}>
            You own the tools that do the work.
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.05,
              maxWidth: 1000,
              backgroundImage: 'linear-gradient(90deg, #a78bfa, #f0abfc, #fb7185)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Now own the digital ones too.
          </div>
        </div>

        {/* Footer line */}
        <div style={{ fontSize: 28, color: '#a1a1aa', display: 'flex' }}>
          Custom software &amp; AI automations · Built in Upstate SC
        </div>
      </div>
    ),
    { ...size }
  );
}
