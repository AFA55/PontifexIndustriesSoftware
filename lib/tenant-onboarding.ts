/**
 * lib/tenant-onboarding.ts — SHARED TENANT-ONBOARDING LOGIC
 * =============================================================================
 * Single source of truth for the steps that stand up a new tenant (and add
 * users to an existing one). Both `scripts/new-tenant.ts` (CLI) and
 * `POST /api/admin/tenants` (Platform Console) import from here so the flow is
 * defined once and battle-tested in one place.
 *
 * SAFETY / INVARIANTS:
 *  - Side-effect-free on import: this module only EXPORTS functions; it performs
 *    no work at module load. The CLI keeps its own guards (PROTECTED ids,
 *    validateConfig, --dry-run/--commit); the API keeps requireSuperAdmin +
 *    explicit-target-tenant scoping. This file does NOT enforce authorization —
 *    callers do.
 *  - Authorization role lives in `profiles.role`, NEVER in `user_metadata`
 *    (CLAUDE.md rule — user_metadata is client-writable, so any operator could
 *    self-promote). We only put `full_name` in user_metadata.
 *  - Every write here takes an EXPLICIT `tenantId`. There is no implicit
 *    "caller's tenant" fallback in this module.
 *
 * Verified against live schema (project klatddoyncxidgqtcjnu):
 *   - tenants(name, slug, domain, company_code, status, plan, max_users,
 *            max_jobs_per_month, owner_id, features jsonb, primary_color, logo_url)
 *     company_code CHECK: ^[A-Z0-9_]{3,20}$
 *   - profiles(id, email, full_name, role, tenant_id, active)
 *   - tenant_branding keyed by tenant_id (company_name, primary_color)
 *   - tenant_users(tenant_id, user_id, role, invited_by)
 * =============================================================================
 */

import { supabaseAdmin } from './supabase-admin';
import { FEATURE_MODULES } from './features';

export const COMPANY_CODE_RE = /^[A-Z0-9_]{3,20}$/; // matches DB CHECK constraint
export const SLUG_RE = /^[a-z0-9-]+$/;

/** Tenants the platform must never recreate/overwrite/destabilize. */
export const PROTECTED_COMPANY_CODES = ['PATRIOT', 'PONTIFEX', 'HIRE', 'OPIFEX'];
export const PROTECTED_SLUGS = ['patriot', 'pontifex', 'hire', 'opifex', 'pontifex-job-board'];
export const PROTECTED_TENANT_IDS = ['ee3d8081-cec2-47f3-ac23-bdc0bb2d142d']; // Patriot (verified live)

export interface TenantOnboardingConfig {
  name: string;
  slug: string;
  companyCode: string;
  domain?: string | null;
  plan?: string;
  maxUsers?: number;
  maxJobsPerMonth?: number;
  primaryColor?: string;
  logoUrl?: string | null;
  billingEmail?: string | null;
  ownerId?: string | null;
  /** Module switchboard. Keys = canonical ModuleKey from lib/features.ts. Core skipped. */
  enabledModules?: Record<string, boolean>;
}

export interface OnboardingUserConfig {
  email: string;
  fullName: string;
  /** Leave undefined to send a Supabase invite/reset email instead of setting a password. */
  tempPassword?: string;
  /** Authorization role written to profiles.role. Defaults to 'admin'. */
  role?: string;
}

/**
 * Build the canonical `features` map from a requested enabled-modules map.
 * Core modules are skipped entirely (always-on; never stored as toggleable).
 * Absent keys fall back to the registry default (currently all-on).
 */
export function buildFeaturesMap(
  enabledModules: Record<string, boolean> | undefined
): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const m of FEATURE_MODULES) {
    if (m.core) continue;
    const requested = enabledModules?.[m.key];
    map[m.key] = requested === undefined ? m.defaultOn : requested;
  }
  return map;
}

/**
 * STEP 1 — create the tenant row.
 * Refuses protected company_code/slug and hard-stops if a tenant with the same
 * company_code or slug already exists (never clobber a live tenant).
 */
export async function createTenantRow(
  cfg: TenantOnboardingConfig
): Promise<{ id: string; company_code: string; slug: string; name: string }> {
  if (PROTECTED_COMPANY_CODES.includes(cfg.companyCode)) {
    throw new Error(`Refusing to use protected company_code ${cfg.companyCode}.`);
  }
  if (PROTECTED_SLUGS.includes(cfg.slug)) {
    throw new Error(`Refusing to use protected slug ${cfg.slug}.`);
  }

  // Hard stop if a tenant with this code/slug already exists.
  const { data: existing } = await supabaseAdmin
    .from('tenants')
    .select('id, company_code, slug')
    .or(`company_code.eq.${cfg.companyCode},slug.eq.${cfg.slug}`)
    .maybeSingle();
  if (existing) {
    if (PROTECTED_TENANT_IDS.includes(existing.id)) {
      throw new Error('Matched a PROTECTED tenant — aborting.');
    }
    throw new Error(
      `Tenant already exists (code=${existing.company_code}, slug=${existing.slug}). Aborting to avoid overwrite.`
    );
  }

  const features = buildFeaturesMap(cfg.enabledModules);

  const insert = {
    name: cfg.name,
    slug: cfg.slug,
    domain: cfg.domain ?? null,
    company_code: cfg.companyCode,
    status: 'active',
    plan: cfg.plan ?? 'professional',
    max_users: cfg.maxUsers ?? 50,
    max_jobs_per_month: cfg.maxJobsPerMonth ?? 500,
    primary_color: cfg.primaryColor ?? '#7c3aed',
    logo_url: cfg.logoUrl ?? null,
    billing_email: cfg.billingEmail ?? null,
    owner_id: cfg.ownerId ?? null,
    features,
  };

  const { data, error } = await supabaseAdmin.from('tenants').insert(insert).select().single();
  if (error) throw new Error(`tenant insert failed: ${error.message}`);
  return data as { id: string; company_code: string; slug: string; name: string };
}

/**
 * STEP 2 — seed a branding row (so the login page is white-labeled day one).
 * Non-fatal: branding has an app-level DEFAULT_BRANDING fallback.
 */
export async function seedBranding(
  tenantId: string,
  cfg: Pick<TenantOnboardingConfig, 'name' | 'primaryColor'>
): Promise<void> {
  const { error } = await supabaseAdmin.from('tenant_branding').upsert(
    {
      tenant_id: tenantId,
      company_name: cfg.name,
      primary_color: cfg.primaryColor ?? '#7c3aed',
    },
    { onConflict: 'tenant_id' }
  );
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[tenant-onboarding] branding seed warning (non-fatal): ${error.message}`);
  }
}

/**
 * STEP 3 — create a user inside a target tenant.
 * Creates the auth user, upserts a `profiles` row scoped to `tenantId` (role in
 * profiles.role, NOT user_metadata), links via `tenant_users`, and — when no
 * tempPassword is supplied — sends a Supabase invite email so they set a password.
 *
 * `tenantUserRole` controls the `tenant_users.role` value (defaults to 'member';
 * the first admin onboarding passes 'owner'). It is separate from the
 * authorization `profiles.role` in `user.role`.
 *
 * Returns the new (or existing) auth user id.
 */
export async function createAdminUser(
  tenantId: string,
  user: OnboardingUserConfig,
  opts?: { tenantUserRole?: string; invitedBy?: string | null; sendInvite?: boolean; origin?: string | null }
): Promise<{ userId: string; invited: boolean }> {
  const role = user.role ?? 'admin';
  const email = user.email.trim().toLowerCase();
  const tenantUserRole = opts?.tenantUserRole ?? 'member';
  const sendInvite = opts?.sendInvite ?? !user.tempPassword;

  // Create the auth user. If no tempPassword, create unconfirmed + send invite.
  const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: user.tempPassword,
    email_confirm: Boolean(user.tempPassword),
    user_metadata: { full_name: user.fullName },
    // NOTE: authorization role lives in profiles.role, NOT user_metadata (CLAUDE.md rule).
  });
  if (authErr) throw new Error(`auth.createUser failed: ${authErr.message}`);
  const userId = created.user.id;

  // Upsert the profile row scoped to the target tenant. active defaults true.
  const { error: profErr } = await supabaseAdmin.from('profiles').upsert(
    { id: userId, email, full_name: user.fullName, role, tenant_id: tenantId, active: true },
    { onConflict: 'id' }
  );
  if (profErr) throw new Error(`profile upsert failed: ${profErr.message}`);

  // Link via tenant_users (best-effort — does not gate onboarding).
  await supabaseAdmin
    .from('tenant_users')
    .insert({ tenant_id: tenantId, user_id: userId, role: tenantUserRole, invited_by: opts?.invitedBy ?? null })
    .then(() => undefined, () => undefined);

  // If no password was set, send OUR branded setup email so they set one on
  // /setup-account (NOT Supabase's inviteUserByEmail, whose email lands on the
  // homepage — founder Jul 23). The auth user already exists here, so we use
  // the existing-user helper rather than the createOrRefreshInvitation pipeline
  // (which rejects emails already present in auth).
  let invited = false;
  if (sendInvite) {
    const { sendSetupInviteForExistingAuthUser } = await import('@/lib/invitations');
    invited = await sendSetupInviteForExistingAuthUser({
      tenantId,
      email,
      name: user.fullName,
      role,
      invitedBy: opts?.invitedBy ?? null,
      origin: opts?.origin ?? null,
    });
  }

  return { userId, invited };
}
