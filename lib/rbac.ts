/**
 * RBAC (Role-Based Access Control) - Shared Constants & Helpers
 *
 * Centralizes card keys, role definitions, permission presets, and helpers
 * used by the admin dashboard, team management page, and API routes.
 */

// ============================================================
// Permission Levels
// ============================================================
export type PermissionLevel = 'none' | 'view' | 'submit' | 'full';

export const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  none: 'No Access',
  view: 'View Only',
  submit: 'Submit',
  full: 'Full Access',
};

// ============================================================
// Admin Dashboard Cards
// ============================================================
export interface AdminCard {
  key: string;
  title: string;
  icon: string;
  description: string;
  href: string;
  bgColor: string;
  iconBg: string;
  features: string[];
}

export const ADMIN_CARDS: AdminCard[] = [
  {
    key: 'timecards',
    title: 'Timecard Management',
    description: 'Review, approve, and edit employee timecards',
    icon: '⏱️',
    href: '/dashboard/admin/timecards',
    bgColor: 'from-emerald-500 to-teal-600',
    iconBg: 'bg-emerald-500',
    features: ['Review clock-ins', 'Approve timecards', 'Edit hours', 'Overtime tracking'],
  },
  {
    key: 'schedule_form',
    title: 'Schedule Form',
    description: '8-step job scheduling wizard for detailed job setup',
    icon: '📋',
    href: '/dashboard/admin/schedule-form',
    bgColor: 'from-orange-500 to-red-600',
    iconBg: 'bg-orange-500',
    features: ['8-step job wizard', 'Jobsite conditions', 'Site compliance', 'Equipment tracking'],
  },
  {
    key: 'schedule_board',
    title: 'Schedule Board',
    description: 'View operator schedules and send schedule notifications',
    icon: '📅',
    href: '/dashboard/admin/schedule-board',
    bgColor: 'from-purple-500 to-indigo-600',
    iconBg: 'bg-purple-500',
    features: ['View all schedules', 'Send email notifications', 'Shop arrival times', 'Daily overview'],
  },
  {
    key: 'team_management',
    title: 'Team Management',
    description: 'Manage team access, approve requests, and set permissions',
    icon: '👥',
    href: '/dashboard/admin/team-management',
    bgColor: 'from-blue-500 to-blue-600',
    iconBg: 'bg-blue-500',
    features: ['Approve access requests', 'Role assignment', 'Card permissions', 'Team directory'],
  },
  {
    key: 'analytics',
    title: 'Analytics & Reports',
    description: 'Comprehensive business analytics and reporting',
    icon: '📈',
    href: '/dashboard/admin/analytics',
    bgColor: 'from-purple-500 to-purple-600',
    iconBg: 'bg-purple-500',
    features: ['Project P&L tracking', 'Operator performance', 'Financial KPIs', 'Production metrics'],
  },
  {
    key: 'operator_profiles',
    title: 'Operator Profiles',
    description: 'Manage operator skills, costs, and certifications',
    icon: '👤',
    href: '/dashboard/admin/operator-profiles',
    bgColor: 'from-blue-500 to-indigo-600',
    iconBg: 'bg-blue-500',
    features: ['Set hourly rates', 'Track skills & certifications', 'Production analytics', 'Task qualifications'],
  },
  {
    key: 'completed_jobs',
    title: 'Completed Job Tickets',
    description: 'View completed jobs with customer signatures and documents',
    icon: '✅',
    href: '/dashboard/admin/completed-job-tickets',
    bgColor: 'from-green-500 to-emerald-600',
    iconBg: 'bg-green-500',
    features: ['Signed job tickets', 'Customer feedback', 'Legal documents', 'Job analytics'],
  },
  {
    key: 'billing',
    title: 'Billing & Invoicing',
    description: 'Generate invoices from completed jobs and track payments',
    icon: '💰',
    href: '/dashboard/admin/billing',
    bgColor: 'from-emerald-600 to-green-700',
    iconBg: 'bg-emerald-600',
    features: ['Auto-generate invoices', 'Track payments', 'PDF export', 'QuickBooks ready'],
  },
  {
    key: 'customer_profiles',
    title: 'Customer Profiles',
    description: 'Manage customer contacts, job history, and billing info',
    icon: '🏢',
    href: '/dashboard/admin/customers',
    bgColor: 'from-blue-500 to-indigo-600',
    iconBg: 'bg-blue-500',
    features: ['Customer database', 'Contact management', 'Job history', 'Revenue tracking'],
  },
  {
    key: 'operations_hub',
    title: 'Operations Hub',
    description: 'System diagnostics, security monitoring, and audit trail',
    icon: '🛡️',
    href: '/dashboard/admin/ops-hub',
    bgColor: 'from-slate-600 to-slate-800',
    iconBg: 'bg-slate-600',
    features: ['API Health Checks', 'Login Audit Trail', 'Error Monitoring', 'Database Stats'],
  },
  {
    key: 'tenant_management',
    title: 'Platform Management',
    description: 'Manage tenants, users, and data backups across the platform',
    icon: '🏢',
    href: '/dashboard/admin/tenant-management',
    bgColor: 'from-violet-600 to-purple-700',
    iconBg: 'bg-violet-600',
    features: ['Tenant management', 'User provisioning', 'Manual backups', 'Plan management'],
  },
  {
    key: 'system_health',
    title: 'System Health',
    description: 'Real-time monitoring of all platform services and infrastructure',
    icon: '🏥',
    href: '/dashboard/admin/system-health',
    bgColor: 'from-green-600 to-emerald-700',
    iconBg: 'bg-green-600',
    features: ['Service monitoring', 'Error tracking', 'User activity', 'Backup status'],
  },
  {
    key: 'settings',
    title: 'Settings',
    description: 'Configure schedule board, capacity, and system preferences',
    icon: '⚙️',
    href: '/dashboard/admin/settings',
    bgColor: 'from-gray-600 to-gray-800',
    iconBg: 'bg-gray-600',
    features: ['Schedule slots', 'Shop notes row', 'Capacity warnings', 'System config'],
  },
  {
    key: 'site_visits',
    title: 'Site Visit Reports',
    description: 'File supervisor visit reports on operators in the field',
    icon: '🧭',
    href: '/dashboard/admin/site-visits',
    bgColor: 'from-violet-500 to-indigo-600',
    iconBg: 'bg-violet-500',
    features: ['Pick operator', 'Auto-pull active job', 'Observations & ratings', 'Follow-up flags'],
  },
  // ── Shop manager / shop help cards (Phase 1A foundation) ─────────────
  {
    key: 'equipment',
    title: 'Equipment Inventory',
    description: 'All saws, drills, generators, hand tools — searchable, taggable, trackable',
    icon: '🛠️',
    href: '/dashboard/admin/equipment',
    bgColor: 'from-cyan-500 to-sky-600',
    iconBg: 'bg-cyan-500',
    features: ['Asset tags + QR codes', 'Status + custodian tracking', 'Maintenance schedules', 'Aliases for voice'],
  },
  {
    key: 'fleet',
    title: 'Fleet',
    description: 'Trucks, trailers — registration, insurance, odometer',
    icon: '🚚',
    href: '/dashboard/admin/fleet',
    bgColor: 'from-blue-500 to-indigo-600',
    iconBg: 'bg-blue-500',
    features: ['Vehicle records', 'Registration expiry alerts', 'Maintenance schedules', 'Insurance tracking'],
  },
  {
    key: 'pull_equipment',
    title: 'Pull Equipment',
    description: 'Generate pre-use checks for upcoming jobs (1+ days ahead)',
    icon: '📦',
    href: '/dashboard/admin/equipment/pull',
    bgColor: 'from-amber-500 to-orange-600',
    iconBg: 'bg-amber-500',
    features: ['Date picker', 'Multi-day ahead', 'Auto-generate checks', 'Reserve equipment'],
  },
  {
    key: 'voice_checkout',
    title: 'Voice Check-Out',
    description: 'Voice-driven equipment checkout + check-in',
    icon: '🎤',
    href: '/dashboard/admin/equipment/voice',
    bgColor: 'from-rose-500 to-pink-600',
    iconBg: 'bg-rose-500',
    features: ['Hands-free checkout', 'Voice check-in', 'Smart aliases', 'Audio audit log'],
  },
  {
    key: 'returned_equipment',
    title: 'Returned Equipment',
    description: 'Items checked back in — needs put-away',
    icon: '🔁',
    href: '/dashboard/admin/equipment/returned',
    bgColor: 'from-teal-500 to-emerald-600',
    iconBg: 'bg-teal-500',
    features: ['Pending put-away queue', 'Mark as available', 'Flag for maintenance', 'Last custodian'],
  },
  {
    key: 'maintenance',
    title: 'Maintenance Inbox',
    description: 'Triage operator-submitted equipment issues',
    icon: '🔧',
    href: '/dashboard/admin/maintenance',
    bgColor: 'from-purple-500 to-violet-600',
    iconBg: 'bg-purple-500',
    features: ['Inbox / Active / Closed', 'Priority + assignee', 'Photo + voice attachments', 'Equipment history'],
  },
  {
    key: 'shop_tasks',
    title: 'Shop Tasks',
    description: 'Pre-use checks + delegated tasks for shop helpers',
    icon: '📋',
    href: '/dashboard/admin/shop-tasks',
    bgColor: 'from-indigo-500 to-purple-600',
    iconBg: 'bg-indigo-500',
    features: ['Pre-use checklists', 'Delegate to shop help', 'Status tracking', 'Critical-fail flagging'],
  },
  {
    key: 'hiring',
    title: 'Hiring',
    description: 'Run social-media hiring ads and manage your candidate pipeline',
    icon: '📣',
    href: '/dashboard/hiring',
    bgColor: 'from-pink-500 to-rose-600',
    iconBg: 'bg-pink-500',
    features: ['AI-generated job ads', 'Screener questions', 'Candidate pipeline', 'One-click translation'],
  },
  {
    key: 'peer_ratings',
    title: 'Peer Ratings',
    description: 'Manage team performance reviews and rating forms',
    icon: '⭐',
    href: '/dashboard/admin/peer-ratings',
    bgColor: 'from-amber-500 to-orange-600',
    iconBg: 'bg-amber-500',
    features: ['Rating form builder', 'Team performance scores', 'Anonymized feedback', 'Job-based reviews'],
  },
];

// All card keys for iteration
export const ALL_CARD_KEYS = ADMIN_CARDS.map(c => c.key);

// ============================================================
// Roles
// ============================================================
export interface RoleOption {
  value: string;
  label: string;
  description: string;
  tier: 'worker' | 'office' | 'management';
}

export const ROLES_WITH_LABELS: RoleOption[] = [
  { value: 'apprentice', label: 'Team Member', description: 'Field helper with basic access and simple dashboard', tier: 'worker' },
  { value: 'operator', label: 'Operator', description: 'Equipment operator with field dashboard', tier: 'worker' },
  { value: 'shop_help', label: 'Shop Helper', description: 'Permanent shop helper — clock in, complete pre-use checks + delegated tasks', tier: 'worker' },
  { value: 'salesman', label: 'Project Manager', description: 'Can request jobs, submit forms, view assigned jobs', tier: 'office' },
  { value: 'supervisor', label: 'Supervisor', description: 'View schedule, leave notes, fill forms, view assigned jobs', tier: 'office' },
  { value: 'shop_manager', label: 'Shop Manager', description: 'Owns equipment + fleet. Triages maintenance. Pulls equipment for upcoming jobs.', tier: 'office' },
  { value: 'inventory_manager', label: 'Office Staff', description: 'View-only schedule, timecards, customers, invoicing', tier: 'office' },
  { value: 'admin', label: 'Admin', description: 'Customizable admin dashboard access', tier: 'office' },
  { value: 'operations_manager', label: 'Operations Manager', description: 'Full system access with diagnostics', tier: 'management' },
  { value: 'super_admin', label: 'Owner / Super Admin', description: 'Full control over entire system', tier: 'management' },
];

// Roles that can access the admin dashboard
export const ADMIN_DASHBOARD_ROLES = ['admin', 'super_admin', 'salesman', 'operations_manager', 'supervisor', 'shop_manager', 'shop_help', 'inventory_manager'];

// Roles that can open the Jarvis Command Center (the live operations HUD).
// All office/management roles — same population as the admin dashboard.
// Worker tier (operator / apprentice) is intentionally excluded.
// This is the SINGLE source of truth shared by the launch tile, the page
// guard, and the overview API gate so UI visibility and data access agree.
export const COMMAND_CENTER_ROLES = [...ADMIN_DASHBOARD_ROLES];

// ============================================================
// Role rank (privilege order) — used to gate invitations so an inviter
// can never create a user with a role >= their own. Higher number = more
// privilege. Mirrors the priority order in CLAUDE.md. supervisor/shop_help
// are slotted alongside their nearest-equivalent tier.
// ============================================================
export const ROLE_RANK: Record<string, number> = {
  super_admin: 8,
  operations_manager: 7,
  admin: 6,
  supervisor: 5,
  salesman: 5,
  shop_manager: 4,
  inventory_manager: 3,
  operator: 2,
  shop_help: 2,
  apprentice: 1,
};

export function getRoleRank(role: string): number {
  return ROLE_RANK[role] ?? 0;
}

/**
 * Roles a given inviter is allowed to assign when inviting a new user.
 *
 * Rule: an inviter may only invite users to a role STRICTLY BELOW their own
 * rank — never equal or higher. The single exception is super_admin, who may
 * invite anyone EXCEPT another super_admin (granting super_admin is reserved
 * and handled separately, never via the invite flow).
 */
export function getInvitableRoles(inviterRole: string): RoleOption[] {
  const inviterRank = getRoleRank(inviterRole);
  return ROLES_WITH_LABELS.filter((r) => {
    if (r.value === 'super_admin') return false; // never invitable via this flow
    return getRoleRank(r.value) < inviterRank;
  });
}

/** Server-side check: can `inviterRole` assign `targetRole` via the invite flow? */
export function canInviteRole(inviterRole: string, targetRole: string): boolean {
  if (targetRole === 'super_admin') return false;
  if (!ROLE_RANK[targetRole]) return false; // unknown target role
  return getRoleRank(targetRole) < getRoleRank(inviterRole);
}

// Roles that bypass all permission checks (always full access)
export const BYPASS_ROLES = ['super_admin', 'operations_manager'];

// ============================================================
// Permission Presets by Role
// ============================================================

function allCards(level: PermissionLevel): Record<string, PermissionLevel> {
  const result: Record<string, PermissionLevel> = {};
  ALL_CARD_KEYS.forEach(key => { result[key] = level; });
  return result;
}

/**
 * Build a preset that contains an entry for every key in ALL_CARD_KEYS.
 * Keys not provided in `overrides` default to 'none'.
 * Warns in dev if an override references a non-card key (prevents the
 * `active_jobs` / `customers` / `invoicing` / `notifications` class of bugs).
 */
function preset(overrides: Record<string, PermissionLevel>): Record<string, PermissionLevel> {
  const result: Record<string, PermissionLevel> = {};
  ALL_CARD_KEYS.forEach(key => { result[key] = 'none'; });
  Object.entries(overrides).forEach(([k, v]) => {
    if (!(k in result)) {
      // eslint-disable-next-line no-console
      if (typeof window === 'undefined') console.warn(`[rbac] preset key "${k}" is not a known ADMIN_CARDS key — ignored`);
      return;
    }
    result[k] = v;
  });
  return result;
}

export const ROLE_PERMISSION_PRESETS: Record<string, Record<string, PermissionLevel>> = {
  super_admin: allCards('full'),
  operations_manager: allCards('full'),
  admin: preset({
    timecards: 'view',
    schedule_form: 'submit',
    schedule_board: 'view',
    team_management: 'view',
    analytics: 'view',
    operator_profiles: 'view',
    completed_jobs: 'view',
    billing: 'view',
    customer_profiles: 'full',
    site_visits: 'view',
    peer_ratings: 'full',
    hiring: 'full',
  }),
  supervisor: preset({
    schedule_form: 'submit',
    schedule_board: 'view',
    active_jobs: 'view',
    customer_profiles: 'view',
    completed_jobs: 'view',
    timecards: 'view',
    site_visits: 'submit',
    equipment: 'view',
    fleet: 'view',
    voice_checkout: 'submit',
  }),
  shop_manager: preset({
    timecards: 'view',
    schedule_board: 'view',
    active_jobs: 'view',        // see WHERE operators are (to drop off equipment, coordinate visits)
    completed_jobs: 'view',
    equipment: 'full',
    fleet: 'full',
    pull_equipment: 'submit',
    voice_checkout: 'submit',
    returned_equipment: 'full',
    maintenance: 'full',
    shop_tasks: 'full',
  }),
  shop_help: preset({
    completed_jobs: 'view',
    shop_tasks: 'submit',
    maintenance: 'submit',
    voice_checkout: 'submit',
  }),
  salesman: preset({
    schedule_form: 'submit',
    schedule_board: 'view',
    customer_profiles: 'view',
    completed_jobs: 'view',
  }),
  inventory_manager: preset({
    schedule_board: 'view',
    customer_profiles: 'view',
    completed_jobs: 'view',
    timecards: 'view',
    billing: 'view',
  }),
  operator: allCards('none'),
  apprentice: preset({
    completed_jobs: 'view',
  }),
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get the effective permission level for a card.
 * Priority: bypass roles → explicit user permissions → role preset → 'none'
 */
export function getCardPermission(
  userPermissions: Record<string, PermissionLevel> | null,
  cardKey: string,
  userRole: string
): PermissionLevel {
  // Super admin and ops manager always get full access
  if (BYPASS_ROLES.includes(userRole)) return 'full';

  // If user has explicit per-user permissions, use them
  if (userPermissions && cardKey in userPermissions) {
    return userPermissions[cardKey];
  }

  // Fall back to role preset
  return ROLE_PERMISSION_PRESETS[userRole]?.[cardKey] || 'none';
}

/**
 * Get the display label for a role value
 */
export function getRoleLabel(roleValue: string): string {
  return ROLES_WITH_LABELS.find(r => r.value === roleValue)?.label || roleValue;
}

/**
 * Get the default permission preset for a role
 */
export function getDefaultPermissions(role: string): Record<string, PermissionLevel> {
  return { ...(ROLE_PERMISSION_PRESETS[role] || allCards('none')) };
}
