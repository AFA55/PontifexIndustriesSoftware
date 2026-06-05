/**
 * scripts/new-tenant.ts — NEW-TENANT ONBOARDING SCAFFOLD
 * =============================================================================
 * Stands up a brand-new tenant (company #2…#N) from the proven Patriot base:
 * inserts a `tenants` row (with company_code + module `features`), seeds a
 * `tenant_branding` row, creates the first admin auth user + profile, and
 * prints next steps.
 *
 * ⚠️  STATUS: REVIEW-BEFORE-USE SCAFFOLD. This file is intentionally NOT wired
 *     to any npm script and has ZERO side effects on import (see bottom guard).
 *     Read it top-to-bottom, fill in the CONFIG, and only then run it manually.
 *
 * ⚠️  This is the ONE additive artifact from the productization plan. It does
 *     not modify rbac/auth/feature-gating. It only INSERTs new rows for a NEW
 *     tenant. It refuses to touch PATRIOT (see GUARDS).
 *
 * HOW TO RUN (only after review):
 *     1. Confirm .env.local points at the intended Supabase project.
 *     2. Edit the CONFIG block below for the new client.
 *     3. Dry run first:   npx tsx scripts/new-tenant.ts --dry-run
 *     4. For real:        npx tsx scripts/new-tenant.ts --commit
 *
 * Verified against live schema (project klatddoyncxidgqtcjnu, 2026-06-04):
 *   - tenants(name, slug, domain, company_code, status, plan, max_users,
 *            max_jobs_per_month, owner_id, features jsonb, primary_color, …)
 *     company_code CHECK: ^[A-Z0-9_]{3,20}$  (migration 20260328_multi_tenant_foundation)
 *   - profiles(id, email, full_name, role, tenant_id)   — no is_active/status col
 *   - tenant_branding keyed by tenant_id (company_name, primary_color, show_*_module…)
 *   - tenant_users(tenant_id, user_id, role, invited_by)
 * =============================================================================
 */

import {
  buildFeaturesMap,
  createTenantRow as onboardCreateTenantRow,
  seedBranding as onboardSeedBranding,
  createAdminUser as onboardCreateAdminUser,
  type TenantOnboardingConfig,
} from '../lib/tenant-onboarding'; // single source of truth shared with POST /api/admin/tenants

// =============================================================================
// CONFIG — edit per new client, then run with --dry-run, then --commit
// =============================================================================
interface NewTenantConfig {
  name: string;                 // "Apex Sawing & Drilling"
  slug: string;                 // lowercase-hyphen, e.g. "apex"  (^[a-z0-9-]+$)
  companyCode: string;          // login disambiguator, e.g. "APEX" (^[A-Z0-9_]{3,20}$)
  domain?: string | null;
  plan?: string;                // 'starter' | 'professional' | 'enterprise'
  maxUsers?: number;
  maxJobsPerMonth?: number;
  primaryColor?: string;        // hex, e.g. "#2563EB"
  logoUrl?: string | null;
  /** Module switchboard. Keys = canonical ModuleKey from lib/features.ts.
   *  Absent keys default to the registry default (currently all-on). Set false
   *  to withhold a module from this client. Core modules are ignored if listed. */
  enabledModules?: Record<string, boolean>;
  admin: {
    email: string;
    fullName: string;
    /** Leave undefined to send a Supabase invite/reset email instead of setting a password here. */
    tempPassword?: string;
    role?: string;              // default 'admin'
  };
}

// ⬇️ PLACEHOLDER — replace before running. Left obviously-fake so an accidental
//    run with --commit fails the validation guards rather than creating junk.
const CONFIG: NewTenantConfig = {
  name: 'REPLACE ME Co.',
  slug: 'replace-me',
  companyCode: 'REPLACEME',
  domain: null,
  plan: 'professional',
  maxUsers: 50,
  maxJobsPerMonth: 500,
  primaryColor: '#2563EB',
  logoUrl: null,
  enabledModules: {
    // Example: a client that wants scheduling + timecards but NOT billing:
    // billing: false,
  },
  admin: {
    email: 'owner@replace-me.com',
    fullName: 'Replace Me',
    tempPassword: undefined,
    role: 'admin',
  },
};

// =============================================================================
// GUARDS — refuse to run against the wrong project or touch PATRIOT
// =============================================================================
const PROTECTED_COMPANY_CODES = ['PATRIOT'];     // never create/overwrite these
const PROTECTED_SLUGS = ['patriot'];
// NOTE: PROTECTED_TENANT_IDS now lives in lib/tenant-onboarding.ts and is enforced
// inside createTenantRow(); the CLI's company_code/slug guards below cover the
// pre-flight refusal so a placeholder run aborts before any DB call.

const COMPANY_CODE_RE = /^[A-Z0-9_]{3,20}$/;     // matches DB CHECK constraint
const SLUG_RE = /^[a-z0-9-]+$/;                   // matches POST /api/admin/tenants

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`[new-tenant] GUARD FAILED: ${msg}`);
}

function validateConfig(cfg: NewTenantConfig): void {
  assert(cfg.name && cfg.name !== 'REPLACE ME Co.', 'CONFIG.name is still the placeholder — edit CONFIG first.');
  assert(SLUG_RE.test(cfg.slug) && cfg.slug !== 'replace-me', `CONFIG.slug "${cfg.slug}" invalid or placeholder (need ^[a-z0-9-]+$).`);
  assert(COMPANY_CODE_RE.test(cfg.companyCode) && cfg.companyCode !== 'REPLACEME', `CONFIG.companyCode "${cfg.companyCode}" invalid or placeholder (need ^[A-Z0-9_]{3,20}$).`);
  assert(!PROTECTED_COMPANY_CODES.includes(cfg.companyCode), `Refusing to use protected company_code ${cfg.companyCode}.`);
  assert(!PROTECTED_SLUGS.includes(cfg.slug), `Refusing to use protected slug ${cfg.slug}.`);
  assert(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cfg.admin.email), `CONFIG.admin.email "${cfg.admin.email}" is not a valid email.`);
  assert(cfg.admin.email !== 'owner@replace-me.com', 'CONFIG.admin.email is still the placeholder.');
}

/** Refuse to run unless the env points at a real (non-placeholder) Supabase project. */
function validateEnvironment(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert(url && !url.includes('placeholder'), 'NEXT_PUBLIC_SUPABASE_URL is missing/placeholder — load .env.local.');
  assert(key && !key.includes('placeholder'), 'SUPABASE_SERVICE_ROLE_KEY is missing/placeholder — load .env.local.');
}

// =============================================================================
// Onboarding steps — thin wrappers over the shared lib/tenant-onboarding.ts so
// the CLI and POST /api/admin/tenants run the SAME battle-tested logic. The CLI
// keeps its own guards (PROTECTED ids, validateConfig, --dry-run/--commit) in
// run(); the shared functions also defend against protected code/slug/id.
// =============================================================================

/** Map the CLI's NewTenantConfig onto the shared TenantOnboardingConfig. */
function toOnboardingConfig(cfg: NewTenantConfig): TenantOnboardingConfig {
  return {
    name: cfg.name,
    slug: cfg.slug,
    companyCode: cfg.companyCode,
    domain: cfg.domain ?? null,
    plan: cfg.plan,
    maxUsers: cfg.maxUsers,
    maxJobsPerMonth: cfg.maxJobsPerMonth,
    primaryColor: cfg.primaryColor,
    logoUrl: cfg.logoUrl ?? null,
    enabledModules: cfg.enabledModules,
  };
}

async function createTenantRow(cfg: NewTenantConfig) {
  return onboardCreateTenantRow(toOnboardingConfig(cfg));
}

async function seedBranding(tenantId: string, cfg: NewTenantConfig) {
  return onboardSeedBranding(tenantId, { name: cfg.name, primaryColor: cfg.primaryColor });
}

async function createAdminUser(tenantId: string, cfg: NewTenantConfig) {
  const { userId } = await onboardCreateAdminUser(
    tenantId,
    {
      email: cfg.admin.email,
      fullName: cfg.admin.fullName,
      tempPassword: cfg.admin.tempPassword,
      role: cfg.admin.role ?? 'admin',
    },
    { tenantUserRole: 'owner' }
  );
  return userId;
}

// =============================================================================
// ORCHESTRATION
// =============================================================================
async function run(cfg: NewTenantConfig, commit: boolean): Promise<void> {
  validateEnvironment();
  validateConfig(cfg);

  const features = buildFeaturesMap(cfg.enabledModules);
  console.log('— new-tenant plan —');
  console.log(`  name:         ${cfg.name}`);
  console.log(`  company_code: ${cfg.companyCode}   slug: ${cfg.slug}`);
  console.log(`  plan:         ${cfg.plan ?? 'professional'}`);
  console.log(`  admin:        ${cfg.admin.email} (${cfg.admin.role ?? 'admin'})`);
  console.log(`  modules:      ${JSON.stringify(features)}`);

  if (!commit) {
    console.log('\n[DRY RUN] No writes performed. Re-run with --commit to apply.');
    return;
  }

  const tenant = await createTenantRow(cfg);
  console.log(`✓ tenant created: ${tenant.id}`);
  await seedBranding(tenant.id, cfg);
  console.log('✓ branding seeded');
  const userId = await createAdminUser(tenant.id, cfg);
  console.log(`✓ admin user created: ${userId}`);

  console.log('\n=== NEXT STEPS (manual) ===');
  console.log(`  1. Verify login: company code ${cfg.companyCode} + ${cfg.admin.email} at the login page.`);
  console.log('  2. Settings → Company Branding: upload square logo + confirm colors.');
  console.log('  3. Super-admin Module Switchboard (once built): confirm enabled modules.');
  console.log('  4. Invite the rest of the team (Team Management → access requests / invite).');
  console.log('  5. (Optional) seed demo data for their trial.');
}

// =============================================================================
// IMPORT GUARD — running this file is opt-in. Importing it does NOTHING.
// `tsx`/`node` set process.argv[1] to this file when executed directly; under
// Next.js/tsc type-checking this block is never reached, so there are no
// side effects on import (satisfies "must compile, no execution on import").
// =============================================================================
const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  /new-tenant\.(ts|js)$/.test(process.argv[1] ?? '');

if (invokedDirectly) {
  const commit = process.argv.includes('--commit');
  run(CONFIG, commit).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

export { run, buildFeaturesMap, validateConfig };
export type { NewTenantConfig };
