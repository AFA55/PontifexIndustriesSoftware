// Capture Play Store phone screenshots from the running dev app (localhost:3000),
// logged in as the demo admin. Outputs 1080x1920 PNGs (Play min 1080px, 9:16).
// Run: node scripts/capture-play-screenshots.mjs   (dev server must be on :3000)
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = 'assets/play/screenshots';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';
const CODE = 'PATRIOT';
const EMAIL = 'admin@pontifex.com';
const PASS = 'PontifexDemo2026!';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  // Phone WIDTH (412 CSS px → mobile layout) at 3x → 1236x2400 PNG.
  // Meets Play: min side 1236 (>1080), ratio 1.94 (<2:1 max).
  defaultViewport: { width: 412, height: 800, deviceScaleFactor: 3 },
});

try {
  const page = await browser.newPage();

  // 1) Company code
  await page.goto(`${BASE}/company-login`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  await page.waitForSelector('input[type="text"]', { timeout: 20000 });
  await page.type('input[type="text"]', CODE);
  await Promise.all([
    page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /continue/i.test(x.textContent));
      if (b) b.click();
    }),
    page.waitForSelector('input[name="email"]', { timeout: 30000 }),
  ]);

  // 2) Login
  await sleep(1200);
  await page.type('input[name="email"]', EMAIL);
  await page.type('input[name="password"]', PASS);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Sign In');
    if (b) b.click();
  });
  // wait for dashboard
  await page.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 45000 });
  await sleep(3000);

  // 3) Capture key screens (each guarded so one failure doesn't abort the rest)
  const screens = [
    { route: '/dashboard/admin', name: '01-dashboard' },
    { route: '/dashboard/job-schedule', name: '02-schedule' },
    { route: '/dashboard/admin/timecards', name: '03-timecards' },
    { route: '/dashboard/command-center', name: '04-command-center' },
    { route: '/dashboard/my-jobs', name: '05-my-jobs' },
  ];
  const done = [];
  for (const s of screens) {
    try {
      await page.goto(`${BASE}${s.route}`, { waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(2800);
      // Hide the Next.js dev-mode indicator badge so it's not in store shots
      await page.addStyleTag({ content: 'nextjs-portal,[data-next-badge-root],[data-nextjs-toast],#__next-build-watcher,[data-nextjs-dev-tools-button]{display:none!important;visibility:hidden!important}' }).catch(() => {});
      await sleep(300);
      const path = `${OUT}/${s.name}.png`;
      await page.screenshot({ path, fullPage: false });
      done.push(path);
      console.log('captured', path);
    } catch (e) {
      console.log('skipped', s.route, '-', e.message.slice(0, 60));
    }
  }
  console.log('\nDONE:', done.length, 'screenshots in', OUT);
} finally {
  await browser.close();
}
