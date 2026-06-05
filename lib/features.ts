/**
 * Canonical feature-module registry — the foundation of the per-tenant
 * "plug-and-play" switchboard (see FEATURE_CATALOG.md + PRODUCTIZATION_SWITCHBOARD_PLAN.md).
 *
 * ⚠️ SCAFFOLD STATE: this registry is currently DATA-ONLY. Nothing gates on it yet.
 * Activating it (reading `tenants.features` to show/hide modules) is a deliberate,
 * separately-reviewed step. Until then, importing this file changes NO behavior —
 * it exists so `scripts/new-tenant.ts` and the future switchboard UI share ONE
 * source of truth for module keys.
 *
 * SAFETY RULES baked in:
 *  - `defaultOn: true` for every module → a tenant with no/partial `features` map
 *    (like Patriot today) gets EVERYTHING. Absence ⇒ on. Never silently disable.
 *  - `core: true` modules are platform-critical (auth/nav/billing/operator flow).
 *    They must NEVER be stored as toggleable or hidden — disabling them breaks the
 *    app. `buildFeaturesMap()` in new-tenant.ts skips them entirely.
 *
 * Keys are the canonical `ModuleKey` vocabulary. Legacy `tenants.features` spellings
 * (e.g. `schedule_board`, `inventory`, `ai_scheduling`) are mapped via LEGACY_ALIASES
 * so the switchboard never misfires on an old key.
 */

export interface FeatureModule {
  /** Canonical, stable key. Stored in tenants.features as `{ [key]: boolean }`. */
  key: string;
  /** Human label for the switchboard UI. */
  label: string;
  /** One-line description of what the module does. */
  description: string;
  /** Platform-core: never toggleable, never hidden. Disabling breaks the app. */
  core?: boolean;
  /** Default state for a new/partial tenant. Always true today (absence ⇒ on). */
  defaultOn: boolean;
}

export const FEATURE_MODULES: readonly FeatureModule[] = [
  { key: 'scheduling', label: 'Scheduling', description: 'Schedule board, schedule form, dispatch, daily assignments.', defaultOn: true },
  { key: 'jobs', label: 'Jobs', description: 'Active jobs, job detail, daily logs, work-performed gate.', core: true, defaultOn: true },
  { key: 'change_orders', label: 'Change Orders', description: 'Auto-numbered change orders on a job.', defaultOn: true },
  { key: 'timecards', label: 'Timecards & Payroll', description: 'Clock-in/out (GPS+NFC), payroll grid, lunch rules, PTO, late tracking.', defaultOn: true },
  { key: 'nfc', label: 'NFC Clock-In', description: 'NFC-tag clock-in/out and tag management.', defaultOn: true },
  { key: 'billing', label: 'Billing & Invoicing', description: 'Invoices, PDF, QuickBooks CSV export, billing milestones.', defaultOn: true },
  { key: 'subscription_billing', label: 'Subscription Billing', description: 'Stripe self-serve subscription + paywall (platform SaaS billing).', core: true, defaultOn: true },
  { key: 'customer_crm', label: 'Customer CRM', description: 'Customer profiles, contacts, job history.', defaultOn: true },
  { key: 'customer_portal', label: 'Customer Portal', description: 'Public signature pages, surveys, form builder, portal links.', defaultOn: true },
  { key: 'completed_jobs', label: 'Completed Jobs', description: 'Completed job tickets, signatures, feedback, labor metrics.', defaultOn: true },
  { key: 'facilities_badging', label: 'Facilities & Badging', description: 'Facility CRUD + operator badge tracking + auto-expiry.', defaultOn: true },
  { key: 'equipment_fleet', label: 'Equipment & Fleet', description: 'Equipment + fleet CRUD, asset tags, custodian tracking.', defaultOn: true },
  { key: 'inventory_control', label: 'Inventory Control', description: 'Unified checkout / check-in / history, truck custodian.', defaultOn: true },
  { key: 'voice_checkout', label: 'Voice Checkout', description: 'Voice-driven equipment checkout with alias learning.', defaultOn: true },
  { key: 'maintenance', label: 'Maintenance Inbox', description: 'Triage operator-submitted equipment issues.', defaultOn: true },
  { key: 'shop_tasks', label: 'Shop Tasks', description: 'Pre-use checks + delegated shop-helper tasks.', defaultOn: true },
  { key: 'supervisor_visits', label: 'Supervisor Visits', description: 'Site-visit reports on field operators.', defaultOn: true },
  { key: 'skills_scheduling', label: 'Skills & Smart Scheduling', description: 'Operator skills taxonomy + skill-match scheduling.', defaultOn: true },
  { key: 'notifications', label: 'Notifications', description: 'In-app + email + APNs push, auto-reminders.', core: true, defaultOn: true },
  { key: 'peer_ratings', label: 'Peer Ratings', description: 'Team performance reviews + operator/peer rating forms.', defaultOn: true },
  { key: 'analytics', label: 'Analytics', description: 'Revenue dashboards, P&L, operator performance, KPIs.', defaultOn: true },
  { key: 'team_management', label: 'Team Management', description: 'Team directory, access requests, role + permission editor.', core: true, defaultOn: true },
  { key: 'daily_reports', label: 'Daily Reports', description: 'Operator daily report flow.', core: true, defaultOn: true },
  { key: 'silica_jha', label: 'Silica & JHA', description: 'Silica exposure plans + job hazard analysis + agreements.', defaultOn: true },
] as const;

/** The canonical module-key union. */
export type ModuleKey = (typeof FEATURE_MODULES)[number]['key'];

/** Legacy `tenants.features` spellings → canonical keys (so old data never misfires). */
export const LEGACY_ALIASES: Record<string, ModuleKey> = {
  schedule_board: 'scheduling',
  ai_scheduling: 'skills_scheduling',
  inventory: 'inventory_control',
  facilities: 'facilities_badging',
};

/** Fast lookup by key. */
export const FEATURE_MODULE_MAP: Record<string, FeatureModule> = Object.fromEntries(
  FEATURE_MODULES.map((m) => [m.key, m])
);

/** Toggleable (non-core) modules — the only ones a tenant switchboard may turn off. */
export const TOGGLEABLE_MODULES: readonly FeatureModule[] = FEATURE_MODULES.filter((m) => !m.core);

/**
 * Resolve whether a module is enabled for a tenant's `features` map.
 * Read semantics (SAFE): core ⇒ always true; unknown key ⇒ true (never gate on
 * vocabulary drift); absent ⇒ the module's defaultOn. Legacy aliases normalized.
 * NOT wired to any gate yet — provided for the switchboard build to use later.
 */
export function isModuleEnabled(
  key: string,
  tenantFeatures: Record<string, unknown> | null | undefined
): boolean {
  const canonical = (LEGACY_ALIASES[key] ?? key) as string;
  const mod = FEATURE_MODULE_MAP[canonical];
  if (!mod) return true; // unknown key ⇒ never disable
  if (mod.core) return true; // core ⇒ always on
  const raw = tenantFeatures?.[canonical] ?? tenantFeatures?.[key];
  if (raw === undefined || raw === null) return mod.defaultOn;
  return Boolean(raw);
}
