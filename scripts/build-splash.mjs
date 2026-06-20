// Build the branded native splash = gradient bridge-P on #1e1b4b (matches SplashIntro),
// replacing the old plain-white-P splash. Run: node scripts/build-splash.mjs
import sharp from 'sharp';

const SIZE = 2732;
const BG = { r: 0x1e, g: 0x1b, b: 0x4b, alpha: 1 }; // #1e1b4b — same as SplashIntro/native bg

// The gradient P from logo.svg (transparent bg — same bridge-P path SplashIntro uses),
// scaled to ~33% of the canvas. Rendering the SVG avoids any baked-in white background.
const logo = await sharp('public/logo.svg', { density: 400 })
  .resize(900, 900, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

const splash = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: BG } })
  .composite([{ input: logo, gravity: 'center' }])
  .png()
  .toBuffer();

await sharp(splash).toFile('assets/splash.png');
await sharp(splash).toFile('assets/splash-dark.png');
console.log('Wrote assets/splash.png + assets/splash-dark.png (gradient P on #1e1b4b).');
