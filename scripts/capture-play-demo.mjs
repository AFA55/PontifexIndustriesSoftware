// Capture Play screenshots with PATRIOT DATA SCRUBBED → generic Pontifex demo data.
// Rebrands "Patriot" → "Pontifex Industries", replaces real names + emails with fakes,
// and fakes the dashboard stat numbers. Outputs phone (1236x2400) + tablet (2560x1440).
// Run: node scripts/capture-play-demo.mjs   (dev server on :3000)
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const PHONE = 'assets/play/screenshots';
const TABLET = 'assets/play/tablet-screenshots';
mkdirSync(PHONE, { recursive: true });
mkdirSync(TABLET, { recursive: true });

const BASE = 'http://localhost:3000';
const CODE = 'PATRIOT', EMAIL = 'admin@pontifex.com', PASS = 'PontifexDemo2026!';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCRUB = () => {
  const FAKE = ['Marcus Bell', 'Diana Cruz', 'Tyler Reed', 'Sofia Mendez', 'Liam Carter', 'Ava Brooks', 'Noah Diaz', 'Mia Flores', 'Owen Gray', 'Ella Ross', 'Jack Nolan', 'Ruby Shaw'];
  const isName = (t) => /^[A-Z][a-zA-Z'’]+(\s+[A-Za-z'’]+)?$/.test(t) && t.length >= 3 && t.length <= 30 && t.toUpperCase() !== t;
  // 1) Replace the person-name element in each roster/list row (cycling fakes)
  let ri = 0;
  document.querySelectorAll('tbody tr, [role="row"], li').forEach((row) => {
    const leaves = [...row.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent.trim());
    const nameEl = leaves.find((el) => isName(el.textContent.trim()));
    if (nameEl) { nameEl.textContent = FAKE[ri % FAKE.length]; ri++; }
  });
  // 2) Walk text nodes: rebrand + scrub emails (+ catch any remaining standalone admin/profile names)
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (tw.nextNode()) nodes.push(tw.currentNode);
  nodes.forEach((t) => {
    let v = t.nodeValue;
    if (!v || !v.trim()) return;
    v = v.replace(/Patriot Concrete Cutting/g, 'Pontifex Industries').replace(/Patriot/g, 'Pontifex Industries');
    v = v.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, 'demo@pontifexindustries.com');
    v = v.replace(/Demo Admin/g, 'Marcus Bell');
    if (v !== t.nodeValue) t.nodeValue = v;
  });
  // 3) Fake the dashboard stat numbers (cards that show a bare "0")
  const fakeStats = ['12', '5', '3', '2'];
  let si = 0;
  document.querySelectorAll('*').forEach((el) => {
    if (el.children.length === 0 && el.textContent.trim() === '0' && si < fakeStats.length) {
      const fs = parseInt(getComputedStyle(el).fontSize || '0', 10);
      if (fs >= 20) { el.textContent = fakeStats[si++]; }
    }
  });
};

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  const login = async () => {
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
    await sleep(2500);
  };

  const HIDE = 'nextjs-portal,[data-next-badge-root],[data-nextjs-toast],#__next-build-watcher,[data-nextjs-dev-tools-button]{display:none!important;visibility:hidden!important}';
  const screens = [
    { route: '/dashboard/admin/timecards', name: '01-payroll' },
    { route: '/dashboard/command-center', name: '02-command-center' },
    { route: '/dashboard/admin', name: '03-dashboard' },
  ];

  await page.setViewport({ width: 412, height: 800, deviceScaleFactor: 3 });
  await login(); // log in once; session persists across viewport changes

  for (const fmt of [
    { dir: PHONE, vp: { width: 412, height: 800, deviceScaleFactor: 3 } },
    { dir: TABLET, vp: { width: 1280, height: 720, deviceScaleFactor: 2 } },
  ]) {
    await page.setViewport(fmt.vp);
    for (const s of screens) {
      try {
        await page.goto(`${BASE}${s.route}`, { waitUntil: 'networkidle2', timeout: 45000 });
        await sleep(2800);
        await page.addStyleTag({ content: HIDE }).catch(() => {});
        await page.evaluate(SCRUB);
        await sleep(400);
        const path = `${fmt.dir}/${s.name}.png`;
        await page.screenshot({ path, fullPage: false });
        console.log('captured', path);
      } catch (e) { console.log('skipped', fmt.dir, s.route, '-', e.message.slice(0, 50)); }
    }
  }
  console.log('\nDONE');
} finally {
  await browser.close();
}
