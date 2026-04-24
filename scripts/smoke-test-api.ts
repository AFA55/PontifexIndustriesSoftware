/**
 * E2E API Smoke Test — Pontifex/Patriot Platform
 *
 * READ-ONLY: This script only issues GET requests against the running Next.js
 * server. It does not POST/PATCH/DELETE anything — no prod data is mutated.
 *
 * What it does:
 *  1. Reads Supabase URL + service role key from .env.local
 *  2. For each configured test user (one per role), mints a Bearer token via
 *     admin.generateLink + verifyOtp (no password required — service role only)
 *  3. Hits ~30 representative GET endpoints
 *  4. Records status, auth-guard behaviour (401 unauth / 403 wrong role /
 *     200 expected) and prints a pass/fail summary table
 *
 * Usage:
 *   1. Ensure `npm run dev` is running (default http://localhost:3000).
 *   2. Set test-user emails in env (SMOKE_USER_<ROLE>) or edit DEFAULT_USERS
 *      below. Each email must already exist in auth.users with a profile row.
 *   3. Run: `npx tsx scripts/smoke-test-api.ts`
 *      (or: `npx ts-node --esm scripts/smoke-test-api.ts`)
 *
 * Override base URL with BASE_URL env var.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ── Load .env.local ────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env.local not found at', envPath);
    process.exit(1);
  }
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, k, v] = m;
    if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Test users (override via env SMOKE_USER_<ROLE>) ────────────────────────
type Role = 'super_admin' | 'admin' | 'operations_manager' | 'salesman' | 'operator';

const DEFAULT_USERS: Record<Role, string> = {
  super_admin: process.env.SMOKE_USER_SUPER_ADMIN || 'pontifexindustries@gmail.com',
  admin: process.env.SMOKE_USER_ADMIN || 'admin@pontifex.com',
  operations_manager: process.env.SMOKE_USER_OPS_MANAGER || '',
  salesman: process.env.SMOKE_USER_SALESMAN || '',
  operator: process.env.SMOKE_USER_OPERATOR || 'demo@pontifex.com',
};

// ── Mint a Bearer session for a given email (service-role magic link flow) ─
async function mintSessionForEmail(email: string): Promise<{ token: string; userId: string; role: string; tenantId: string | null } | null> {
  if (!email) return null;

  // Look up the user
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) {
    console.warn(`  [warn] could not list users: ${listErr.message}`);
    return null;
  }
  const user = list.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.warn(`  [warn] user not found: ${email}`);
    return null;
  }

  // Fetch profile for role + tenant
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single();

  // Mint an access token by generating a magic link and exchanging the
  // hashed_token via verifyOtp. This avoids needing the user's password.
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkErr || !linkData?.properties?.hashed_token) {
    console.warn(`  [warn] could not generate magic link for ${email}: ${linkErr?.message || 'no hashed_token'}`);
    return null;
  }

  const publicClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: verifyData, error: verifyErr } = await publicClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (verifyErr || !verifyData?.session?.access_token) {
    console.warn(`  [warn] verifyOtp failed for ${email}: ${verifyErr?.message}`);
    return null;
  }

  return {
    token: verifyData.session.access_token,
    userId: user.id,
    role: profile?.role || 'unknown',
    tenantId: profile?.tenant_id || null,
  };
}

// ── Endpoints to smoke-test (all GETs — read-only) ─────────────────────────
interface Endpoint {
  path: string;
  label: string;
  expect: Partial<Record<Role | 'unauth', number | number[]>>; // expected status(es)
  category: string;
}

const ENDPOINTS: Endpoint[] = [
  // ── Auth / profile ──────────────────────────────────────────────────────
  { category: 'auth', path: '/api/my-profile', label: 'GET my-profile', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 200 } },
  { category: 'auth', path: '/api/card-permissions/me', label: 'GET card-permissions/me', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 200 } },
  { category: 'auth', path: '/api/health', label: 'GET health', expect: { unauth: 200, super_admin: 200 } },

  // ── Admin / dashboard ───────────────────────────────────────────────────
  { category: 'admin', path: '/api/admin/dashboard-stats', label: 'GET dashboard-stats', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },
  { category: 'admin', path: '/api/admin/dashboard-summary', label: 'GET dashboard-summary', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },
  { category: 'admin', path: '/api/admin/ops-hub', label: 'GET ops-hub', expect: { unauth: 401, super_admin: 200, operations_manager: 200, admin: 403, operator: 403 } },

  // ── Schedule board ──────────────────────────────────────────────────────
  { category: 'schedule', path: '/api/admin/schedule-board', label: 'GET schedule-board', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },
  { category: 'schedule', path: '/api/admin/schedule-board/operators', label: 'GET schedule-board/operators', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },
  { category: 'schedule', path: '/api/admin/schedule-board/time-off', label: 'GET schedule-board/time-off', expect: { unauth: 401, super_admin: 200, admin: 200 } },
  { category: 'schedule', path: '/api/admin/capacity-settings', label: 'GET capacity-settings', expect: { unauth: 401, super_admin: 200, admin: 200 } },

  // ── Jobs ────────────────────────────────────────────────────────────────
  { category: 'jobs', path: '/api/admin/active-jobs', label: 'GET active-jobs', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },
  { category: 'jobs', path: '/api/admin/active-jobs-summary', label: 'GET active-jobs-summary', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },
  { category: 'jobs', path: '/api/admin/job-orders', label: 'GET job-orders', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },
  { category: 'jobs', path: '/api/admin/schedule-forms', label: 'GET schedule-forms', expect: { unauth: 401, super_admin: 200, admin: 200 } },

  // ── Timecards ───────────────────────────────────────────────────────────
  { category: 'timecards', path: '/api/timecard/current', label: 'GET timecard/current', expect: { unauth: 401, super_admin: [200, 404], operator: [200, 404] } },
  { category: 'timecards', path: '/api/timecard/my-entries', label: 'GET timecard/my-entries', expect: { unauth: 401, super_admin: 200, operator: 200 } },
  { category: 'timecards', path: '/api/timecard/history', label: 'GET timecard/history', expect: { unauth: 401, super_admin: 200, operator: 200 } },
  { category: 'timecards', path: '/api/admin/timecards', label: 'GET admin/timecards', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },
  { category: 'timecards', path: '/api/admin/timecards/team-summary', label: 'GET timecards/team-summary', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },

  // ── Invoices / billing ──────────────────────────────────────────────────
  { category: 'billing', path: '/api/admin/invoices', label: 'GET invoices', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },
  { category: 'billing', path: '/api/admin/job-pnl', label: 'GET job-pnl', expect: { unauth: 401, super_admin: 200, admin: 200 } },
  { category: 'billing', path: '/api/billing/subscription', label: 'GET billing/subscription', expect: { unauth: 401, super_admin: [200, 404], admin: [200, 404] } },

  // ── Customers ───────────────────────────────────────────────────────────
  { category: 'customers', path: '/api/admin/customers', label: 'GET customers', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },
  { category: 'customers', path: '/api/admin/customers/search?q=test', label: 'GET customers/search', expect: { unauth: 401, super_admin: 200, admin: 200 } },

  // ── Facilities / badges ─────────────────────────────────────────────────
  { category: 'facilities', path: '/api/admin/facilities', label: 'GET facilities', expect: { unauth: 401, super_admin: 200, admin: 200 } },
  { category: 'facilities', path: '/api/admin/badges', label: 'GET badges', expect: { unauth: 401, super_admin: 200, admin: 200 } },

  // ── Notifications ───────────────────────────────────────────────────────
  { category: 'notifications', path: '/api/notifications', label: 'GET notifications', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 200 } },
  { category: 'notifications', path: '/api/admin/notifications', label: 'GET admin/notifications', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },
  { category: 'notifications', path: '/api/admin/notification-settings', label: 'GET notification-settings', expect: { unauth: 401, super_admin: 200, admin: 200 } },

  // ── Users / admin ──────────────────────────────────────────────────────
  { category: 'admin-users', path: '/api/admin/users', label: 'GET admin/users', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },
  { category: 'admin-users', path: '/api/admin/profiles', label: 'GET admin/profiles', expect: { unauth: 401, super_admin: 200, admin: 200 } },

  // ── Analytics ───────────────────────────────────────────────────────────
  { category: 'analytics', path: '/api/admin/analytics', label: 'GET analytics', expect: { unauth: 401, super_admin: 200, admin: 200, operator: 403 } },

  // ── Branding ────────────────────────────────────────────────────────────
  { category: 'branding', path: '/api/admin/branding', label: 'GET branding', expect: { unauth: 401, super_admin: 200, admin: 200 } },
];

// ── Runner ─────────────────────────────────────────────────────────────────
interface Result {
  endpoint: string;
  category: string;
  actor: string;
  status: number;
  expected: number | number[] | undefined;
  pass: boolean;
  note?: string;
}

async function fetchStatus(url: string, token?: string): Promise<{ status: number; bodyPreview: string }> {
  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    let bodyPreview = '';
    try {
      const text = await res.text();
      bodyPreview = text.slice(0, 120);
    } catch {
      /* ignore */
    }
    return { status: res.status, bodyPreview };
  } catch (err: any) {
    return { status: 0, bodyPreview: `FETCH_ERROR: ${err?.message || err}` };
  }
}

function matchesExpected(status: number, expected: number | number[] | undefined): boolean {
  if (expected === undefined) return true; // no expectation = skip
  if (Array.isArray(expected)) return expected.includes(status);
  return status === expected;
}

async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Pontifex/Patriot API Smoke Test');
  console.log('  Base URL: ' + BASE_URL);
  console.log('  Supabase: ' + SUPABASE_URL);
  console.log('════════════════════════════════════════════════════════════');
  console.log();

  // Check base URL reachable
  console.log('[pre-flight] Checking ' + BASE_URL + '/api/health ...');
  const preflight = await fetchStatus(`${BASE_URL}/api/health`);
  if (preflight.status === 0) {
    console.error('FATAL: cannot reach ' + BASE_URL + '. Is `npm run dev` running?');
    process.exit(1);
  }
  console.log(`  → status ${preflight.status}`);
  console.log();

  // Mint tokens for each role
  console.log('[auth] Minting Bearer tokens for test users...');
  const tokens: Partial<Record<Role, { token: string; userId: string; role: string; tenantId: string | null }>> = {};
  for (const role of Object.keys(DEFAULT_USERS) as Role[]) {
    const email = DEFAULT_USERS[role];
    if (!email) {
      console.log(`  ${role.padEnd(20)} SKIP (no email configured, set SMOKE_USER_${role.toUpperCase()})`);
      continue;
    }
    const session = await mintSessionForEmail(email);
    if (session) {
      tokens[role] = session;
      console.log(`  ${role.padEnd(20)} OK (${email}, actual role=${session.role}, tenant=${session.tenantId || 'null'})`);
    } else {
      console.log(`  ${role.padEnd(20)} FAIL (${email})`);
    }
  }
  console.log();

  // Run tests
  const results: Result[] = [];
  console.log('[run] Hitting ' + ENDPOINTS.length + ' endpoints × actors...');

  for (const ep of ENDPOINTS) {
    const url = `${BASE_URL}${ep.path}`;

    // unauth
    if ('unauth' in ep.expect) {
      const { status, bodyPreview } = await fetchStatus(url);
      const expected = ep.expect.unauth;
      results.push({
        endpoint: ep.path,
        category: ep.category,
        actor: 'unauth',
        status,
        expected,
        pass: matchesExpected(status, expected),
        note: status >= 500 ? bodyPreview : undefined,
      });
    }

    // each role
    for (const role of Object.keys(tokens) as Role[]) {
      if (!(role in ep.expect)) continue;
      const tok = tokens[role];
      if (!tok) continue;
      const { status, bodyPreview } = await fetchStatus(url, tok.token);
      const expected = ep.expect[role];
      results.push({
        endpoint: ep.path,
        category: ep.category,
        actor: role,
        status,
        expected,
        pass: matchesExpected(status, expected),
        note: status >= 500 ? bodyPreview : undefined,
      });
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log();
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Results');
  console.log('════════════════════════════════════════════════════════════');

  const byCategory = new Map<string, Result[]>();
  for (const r of results) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  let totalPass = 0;
  let totalFail = 0;
  for (const [cat, rs] of byCategory) {
    console.log();
    console.log(`--- ${cat} ---`);
    for (const r of rs) {
      const icon = r.pass ? 'PASS' : 'FAIL';
      const exp = Array.isArray(r.expected) ? r.expected.join('|') : r.expected ?? '-';
      const note = r.note ? ` — ${r.note.replace(/\n/g, ' ')}` : '';
      console.log(
        `  ${icon}  [${r.actor.padEnd(18)}] ${r.endpoint.padEnd(46)} → ${String(r.status).padStart(3)} (expect ${exp})${note}`,
      );
      if (r.pass) totalPass++;
      else totalFail++;
    }
  }

  console.log();
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  TOTAL: ${totalPass} passed, ${totalFail} failed`);
  console.log('════════════════════════════════════════════════════════════');
  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
