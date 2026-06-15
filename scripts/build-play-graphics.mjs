// Generate Google Play store graphics from brand assets.
// Run: node scripts/build-play-graphics.mjs   (sharp via @capacitor/assets)
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

await mkdir('assets/play', { recursive: true });

// 1) High-res app icon: 512×512 PNG (Play listing requirement).
await sharp('public/icon-1024.png').resize(512, 512).png().toFile('assets/play/icon-512.png');

// 2) Feature graphic: 1024×500.
const W = 1024, H = 500;

// Rounded white "app tile" holding the P (the icon is the P on white).
const TILE = 300, R = 56;
const pOnWhite = await sharp('public/icon-1024.png').resize(TILE, TILE).toBuffer();
const tileFlat = await sharp({ create: { width: TILE, height: TILE, channels: 4, background: '#ffffff' } })
  .composite([{ input: pOnWhite }])
  .png()
  .toBuffer();
const cornerMask = Buffer.from(`<svg width="${TILE}" height="${TILE}"><rect width="${TILE}" height="${TILE}" rx="${R}" ry="${R}"/></svg>`);
const tile = await sharp(tileFlat).composite([{ input: cornerMask, blend: 'dest-in' }]).png().toBuffer();

const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#160c33"/>
      <stop offset="1" stop-color="#0a0618"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7C3AED"/>
      <stop offset="0.5" stop-color="#DB2777"/>
      <stop offset="1" stop-color="#EF4444"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="${H - 8}" width="${W}" height="8" fill="url(#brand)"/>
  <text x="420" y="208" font-family="Helvetica, Arial, sans-serif" font-size="52" font-weight="bold" fill="#ffffff">Pontifex Industries</text>
  <text x="422" y="262" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#cfc9ec">Concrete-cutting operations, managed.</text>
  <text x="422" y="306" font-family="Helvetica, Arial, sans-serif" font-size="23" fill="#9c95c6">Scheduling &#183; crews &#183; time tracking &#183; invoicing</text>
</svg>`);

await sharp(bg)
  .composite([{ input: tile, left: 80, top: 100 }])
  .png()
  .toFile('assets/play/feature-graphic-1024x500.png');

console.log('Wrote assets/play/icon-512.png + assets/play/feature-graphic-1024x500.png');
