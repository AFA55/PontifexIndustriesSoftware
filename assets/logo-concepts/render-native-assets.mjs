// Renders the iOS app icon (opaque, no alpha) + splash from the Pontifex bridge-"P".
// Overwrites ios/App/App/Assets.xcassets AppIcon + Splash. Run from repo root:
//   node assets/logo-concepts/render-native-assets.mjs
import sharp from 'sharp';

const P_PATH = 'M70,160 L70,44 L108,44 A32 32 0 0 1 108,108 L70,108';

// ── App icon: opaque DARK tile + purple→red gradient P (no alpha → Apple-safe) ──
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#8B5CF6"/><stop offset="0.5" stop-color="#EC4899"/><stop offset="1" stop-color="#F43F5E"/>
  </linearGradient></defs>
  <rect width="200" height="200" fill="#120A24"/>
  <g transform="translate(-5,-2)" fill="none" stroke="url(#g)" stroke-width="19" stroke-linecap="round" stroke-linejoin="round">
    <path d="${P_PATH}"/>
  </g>
</svg>`;

// ── Splash: white P centered on the brand indigo (#1e1b4b matches LaunchScreen → no flash) ──
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="#1e1b4b"/>
  <g transform="translate(1366,1366) scale(5) translate(-100,-101)" fill="none" stroke="#FFFFFF" stroke-width="17" stroke-linecap="round" stroke-linejoin="round">
    <path transform="translate(-5,-2)" d="${P_PATH}"/>
  </g>
</svg>`;

const ICON = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';
const SPLASH = [
  'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png',
];

await sharp(Buffer.from(iconSvg), { density: 384 }).resize(1024, 1024).flatten({ background: '#FFFFFF' }).png().toFile(ICON);
console.log('wrote', ICON);

const splashBuf = await sharp(Buffer.from(splashSvg), { density: 200 }).resize(2732, 2732).flatten({ background: '#1e1b4b' }).png().toBuffer();
for (const f of SPLASH) { await sharp(splashBuf).png().toFile(f); console.log('wrote', f); }
console.log('done');
