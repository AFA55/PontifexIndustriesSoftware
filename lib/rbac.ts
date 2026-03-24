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
    key: 'tools_equipment',
    title: 'Tools & Equipment',
    description: 'View all equipment across operators and manage inventory',
    icon: '⚙️',
    href: '/dashboard/admin/all-equipment',
    bgColor: 'from-purple-500 to-pink-600',
    iconBg: 'bg-purple-500',
    features: ['View all equipment', 'Search by operator', 'Equipment status', 'Assignment tracking'],
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
  { value: 'apprentice', label: 'Team Member / Helper', description: 'Field helper with basic access', tier: 'worker' },
  { value: 'operator', label: 'Operator', description: 'Equipment operator with field dashboard', tier: 'worker' },
  { value: 'salesman', label: 'Sales', description: 'Schedule forms and board access', tier: 'office' },
  { value: 'supervisor', label: 'Supervisor', description: 'Submit forms, add notes, view schedules', tier: 'office' },
  { value: 'admin', label: 'Admin', description: 'Customizable admin dashboard access', tier: 'office' },
  { value: 'operations_manager', label: 'Operations Manager', description: 'Full system access with diagnostics', tier: 'management' },
  { value: 'super_admin', label: 'Owner / Super Admin', description: 'Full control over entire system', tier: 'management' },
];

// Roles that can access the admin dashboard
export const ADMIN_DASHBOARD_ROLES = ['admin', 'super_admin', 'salesman', 'operations_manager', 'supervisor'];

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

export const ROLE_PERMISSION_PRESETS: Record<string, Record<string, PermissionLevel>> = {
  super_admin: allCards('full'),
  operations_manager: allCards('full'),
  admin: {
    timecards: 'view',
    schedule_form: 'submit',
    schedule_board: 'view',
    team_management: 'view',
    analytics: 'view',
    operator_profiles: 'view',
    completed_jobs: 'view',
    tools_equipment: 'none',
    billing: 'view',
    customer_profiles: 'full',
    operations_hub: 'none',
    settings: 'none',
  },
  supervisor: {
    timecards: 'view',
    schedule_form: 'full',
    schedule_board: 'view',
    team_management: 'none',
    analytics: 'view',
    operator_profiles: 'view',
    completed_jobs: 'view',
    tools_equipment: 'view',
    billing: 'none',
    customer_profiles: 'none',
    operations_hub: 'none',
    settings: 'none',
  },
  salesman: {
    timecards: 'none',
    schedule_form: 'full',
    schedule_board: 'full',
    team_management: 'none',
    analytics: 'view',
    operator_profiles: 'none',
    completed_jobs: 'none',
    tools_equipment: 'none',
    billing: 'none',
    customer_profiles: 'view',
    operations_hub: 'none',
    settings: 'none',
  },
  operator: allCards('none'),
  apprentice: allCards('none'),
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
