// Capture Play Store TABLET screenshots (16:9 landscape, 2560x1440) from the dev app.
// Satisfies BOTH 7-inch (320-3840px) and 10-inch (1080-7680px) tablet specs + 16:9 ratio.
// Run: node scripts/capture-play-tablet.mjs   (dev server must be on :3000)
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = 'assets/play/tablet-screenshots';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';
const CODE = 'PATRIOT';
const EMAIL = 'admin@pontifex.com';
const PASS = 'PontifexDemo2026!';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  // Landscape tablet: 1280x720 CSS @ 2x = 2560x1440 (exactly 16:9)
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 2 },
});

try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/company-login`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  await page.waitForSelector('input[type="text"]', { timeout: 20000 });
  await page.type('input[type="text"]', CODE);
  await Promise.all([
    page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /continue/i.test(x.textContent)); if (b) b.click(); }),
    page.waitForSelector('input[name="email"]', { timeout: 30000 }),
  ]);
  await sleep(1200);
  await page.type('input[name="email"]', EMAIL);
  await page.type('input[name="password"]', PASS);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Sign In'); if (b) b.click(); });
  await page.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 45000 });
  await sleep(3000);

  const screens = [
    { route: '/dashboard/admin', name: '01-dashboard' },
    { route: '/dashboard/admin/timecards', name: '02-timecards' },
    { route: '/dashboard/command-center', name: '03-command-center' },
    { route: '/dashboard/job-schedule', name: '04-schedule' },
  ];
  const done = [];
  for (const s of screens) {
    try {
      await page.goto(`${BASE}${s.route}`, { waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(2800);
      await page.addStyleTag({ content: 'nextjs-portal,[data-next-badge-root],[data-nextjs-toast],#__next-build-watcher,[data-nextjs-dev-tools-button]{display:none!important;visibility:hidden!important}' }).catch(() => {});
      await sleep(300);
      const path = `${OUT}/${s.name}.png`;
      await page.screenshot({ path, fullPage: false });
      done.push(path);
      console.log('captured', path);
    } catch (e) { console.log('skipped', s.route, '-', e.message.slice(0, 60)); }
  }
  console.log('\nDONE:', done.length, 'tablet screenshots in', OUT);
} finally {
  await browser.close();
}
