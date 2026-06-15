// Build a properly-padded Android adaptive-icon foreground + white background.
// The P is scaled to ~60% so it survives the circular/squircle mask safe zone.
// Run: node scripts/build-adaptive-icon.mjs   (sharp comes via @capacitor/assets)
import sharp from 'sharp';

const SIZE = 1024;
const FG = Math.round(SIZE * 0.60); // logo occupies center 60% → inside the adaptive safe zone

const logo = await sharp('public/icon-1024.png')
  .resize(FG, FG, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer();

await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: logo, gravity: 'center' }])
  .png()
  .toFile('assets/icon-foreground.png');

await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
  .png()
  .toFile('assets/icon-background.png');

console.log('Wrote assets/icon-foreground.png (60% padded) + assets/icon-background.png (white).');
