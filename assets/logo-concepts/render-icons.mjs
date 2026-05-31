// Renders the Pontifex "P" bridge-stroke mark (journey gradient on opaque white) to all web/PWA PNG sizes.
// Run from repo root: node assets/logo-concepts/render-icons.mjs
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#7C3AED"/>
      <stop offset="0.5" stop-color="#DB2777"/>
      <stop offset="1" stop-color="#EF4444"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" fill="#FFFFFF"/>
  <g transform="translate(-5,-2)" fill="none" stroke="url(#g)" stroke-width="19" stroke-linecap="round" stroke-linejoin="round">
    <path d="M70,160 L70,44 L108,44 A32 32 0 0 1 108,108 L70,108"/>
  </g>
</svg>`;

const targets = [
  ['public/icon-1024.png', 1024],
  ['public/icon-512.png', 512],
  ['public/icon-192.png', 192],
  ['public/apple-touch-icon.png', 180],
  ['public/favicon-32x32.png', 32],
  ['public/favicon-16x16.png', 16],
];

for (const [file, size] of targets) {
  await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toFile(file);
  console.log(`wrote ${file} (${size}x${size})`);
}
console.log('done');
