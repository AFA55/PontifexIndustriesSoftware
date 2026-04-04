'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Users, UserPlus, Search, Shield, Crown,
  Star, Briefcase, User, Settings, X,
  AlertTriangle, CheckCircle2, Mail, Phone, Calendar,
  Loader2, ChevronRight, Activity, Clock, UserCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import FeatureFlagsPanel, { type UserFeatureFlags } from '@/components/FeatureFlagsPanel';
import InviteMemberModal from '@/components/InviteMemberModal';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
  phone_number?: string | null;
  phone?: string | null;
  profile_picture_url?: string | null;
  created_at?: string;
  date_of_birth?: string | null;
  hire_date?: string | null;
  next_review_date?: string | null;
  nickname?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maps backend role values to human-friendly display labels */
const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Owner / Super Admin',
  operations_manager: 'Management',
  admin: 'Admin',
  supervisor: 'Supervisor',
  salesman: 'Project Manager',
  inventory_manager: 'Office Admin',
  shop_manager: 'Office Admin',
  operator: 'Operator',
  apprentice: 'Team Member',
};

const ROLE_GRADIENT: Record<string, string> = {
  super_admin: 'from-purple-500 to-indigo-600',
  operations_manager: 'from-indigo-500 to-blue-600',
  admin: 'from-blue-500 to-cyan-600',
  supervisor: 'from-teal-500 to-emerald-600',
  salesman: 'from-orange-500 to-amber-600',
  shop_manager: 'from-cyan-500 to-blue-600',
  inventory_manager: 'from-sky-500 to-blue-600',
  operator: 'from-green-500 to-emerald-600',
  apprentice: 'from-slate-400 to-slate-600',
};

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'bg-violet-50 text-violet-700 border-violet-200',
  operations_manager: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  admin: 'bg-blue-50 text-blue-700 border-blue-200',
  supervisor: 'bg-teal-50 text-teal-700 border-teal-200',
  shop_manager: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  inventory_manager: 'bg-sky-50 text-sky-700 border-sky-200',
  salesman: 'bg-orange-50 text-orange-700 border-orange-200',
  operator: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  apprentice: 'bg-slate-50 text-slate-700 border-slate-200',
};

const ROLE_ICON: Record<string, React.ElementType> = {
  super_admin: Crown,
  operations_manager: Shield,
  admin: Briefcase,
  supervisor: UserCheck,
  salesman: Star,
  shop_manager: Settings,
  inventory_manager: Settings,
  operator: User,
  apprentice: User,
};

/** Ordered list of roles used for tab filtering */
const ROLE_ORDER = [
  'super_admin',
  'operations_manager',
  'admin',
  'supervisor',
  'salesman',
  'inventory_manager',
  'shop_manager',
  'operator',
  'apprentice',
];

function getRoleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

// ─── Member Avatar ────────────────────────────────────────────────────────────

function MemberAvatar({
  member,
  size = 'md',
}: {
  member: Pick<TeamMember, 'full_name' | 'role' | 'profile_picture_url'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-16 h-16 text-xl' : 'w-10 h-10 text-sm';
  const gradient = ROLE_GRADIENT[member.role] || 'from-gray-400 to-gray-600';

  if (member.profile_picture_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.profile_picture_url}
        alt={member.full_name}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ring-2 ring-white/10`}
      />
    );
  }
  return (
    <div className={`${sizeClass} bg-gradient-to-br ${gradient} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {member.full_name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Role Badge Pill ──────────────────────────────────────────────────────────

function RolePill({ role }: { role: string }) {
  const RoleIcon = ROLE_ICON[role] || User;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-semibold ${ROLE_BADGE[role] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
      <RoleIcon className="w-3 h-3" />
      {getRoleLabel(role)}
    </span>
  );
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-semibold ${active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ─── Grant Super Admin Confirmation Dialog ────────────────────────────────────

function GrantSuperAdminDialog({
  member,
  onConfirm,
  onCancel,
  saving,
}: {
  member: TeamMember;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-sm">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Grant Super Admin</h3>
              <p className="text-sm text-gray-500">This action cannot be undone easily</p>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">
                <strong>{member.full_name}</strong> will gain full unrestricted access to all
                platform features, data, and admin controls. This should only be granted to
                trusted senior staff.
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={saving}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-3 font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={saving}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl py-3 font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
              {saving ? 'Granting...' : 'Grant Access'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-sm text-gray-700 break-all">{value || '—'}</p>
      </div>
    </div>
  );
}

// ─── ActionButton (for quick actions) ────────────────────────────────────────

function ActionButton({
  label,
  href,
  onClick,
  variant = 'default',
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'default' | 'danger' | 'success';
}) {
  const cls = `flex items-center justify-between px-4 py-3 rounded-xl transition-colors text-sm font-medium group ${
    variant === 'danger'
      ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
      : variant === 'success'
      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
      : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200'
  }`;

  if (href) {
    return (
      <Link href={href} className={cls}>
        <span>{label}</span>
        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={cls}>
      <span>{label}</span>
      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
    </button>
  );
}

// ─── Role-Specific Profile Info ───────────────────────────────────────────────

function ProfileInfoSection({ member }: { member: TeamMember }) {
  const phone = member.phone_number || member.phone;

  // super_admin: name, email, DOB, join date
  if (member.role === 'super_admin') {
    return (
      <div className="space-y-3">
        <InfoRow icon={Mail} label="Email" value={member.email} />
        <InfoRow icon={Calendar} label="Date of Birth" value={formatDate(member.date_of_birth)} />
        <InfoRow icon={Clock} label="Member Since" value={formatDate(member.created_at)} />
      </div>
    );
  }

  // operator / apprentice: email, phone, hire_date, next_review_date
  if (member.role === 'operator' || member.role === 'apprentice') {
    return (
      <div className="space-y-3">
        <InfoRow icon={Mail} label="Email" value={member.email} />
        {phone && <InfoRow icon={Phone} label="Phone" value={phone} />}
        <InfoRow icon={Calendar} label="Hire Date" value={formatDate(member.hire_date)} />
        <InfoRow icon={Clock} label="Next Review" value={formatDate(member.next_review_date)} />
      </div>
    );
  }

  // admin / operations_manager / salesman / supervisor / inventory_manager / shop_manager
  return (
    <div className="space-y-3">
      <InfoRow icon={Mail} label="Email" value={member.email} />
      {phone && <InfoRow icon={Phone} label="Phone" value={phone} />}
      <InfoRow icon={Calendar} label="Date of Birth" value={formatDate(member.date_of_birth)} />
      {member.nickname && <InfoRow icon={User} label="Nickname" value={member.nickname} />}
      <InfoRow icon={Clock} label="Member Since" value={formatDate(member.created_at)} />
    </div>
  );
}

// ─── Role-Specific Quick Actions ──────────────────────────────────────────────

function QuickActionsSection({
  member,
  isSuperAdmin,
  onEditPermissions,
  onToggleActive,
}: {
  member: TeamMember;
  isSuperAdmin: boolean;
  onEditPermissions: () => void;
  onToggleActive: () => void;
}) {
  // super_admin: no quick actions
  if (member.role === 'super_admin') return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Quick Actions</h3>
      <ActionButton label="Edit Permissions" onClick={onEditPermissions} />
      {member.role === 'operator' && (
        <ActionButton label="View Timecards" href="/dashboard/admin/timecards" />
      )}
      <ActionButton
        label={member.active ? 'Deactivate Account' : 'Activate Account'}
        onClick={onToggleActive}
        variant={member.active ? 'danger' : 'success'}
      />
    </div>
  );
}

// ─── Member Detail Panel ──────────────────────────────────────────────────────

type DetailTab = 'info' | 'permissions';

function MemberDetailPanel({
  member,
  isSuperAdmin,
  currentUserId,
  onClose,
  onGrantSuperAdmin,
  onToggleActive,
  getAuthHeaders,
}: {
  member: TeamMember;
  isSuperAdmin: boolean;
  currentUserId: string;
  onClose: () => void;
  onGrantSuperAdmin: (member: TeamMember) => void;
  onToggleActive: (member: TeamMember) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}) {
  const [tab, setTab] = useState<DetailTab>('info');
  const [flags, setFlags] = useState<Partial<UserFeatureFlags> | null>(null);
  const [loadingFlags, setLoadingFlags] = useState(false);

  useEffect(() => {
    // Reset tab when member changes
    setTab('info');
    setFlags(null);
  }, [member.id]);

  useEffect(() => {
    if (tab === 'permissions' && flags === null) {
      setLoadingFlags(true);
      getAuthHeaders().then(headers =>
        fetch(`/api/admin/user-flags/${member.id}`, { headers })
          .then(r => r.json())
          .then(json => setFlags(json.data || {}))
          .catch(() => setFlags({}))
          .finally(() => setLoadingFlags(false))
      );
    }
  }, [tab, member.id, flags, getAuthHeaders]);

  const isOwnProfile = member.id === currentUserId;
  const canGrant = isSuperAdmin && !isOwnProfile && member.role !== 'super_admin';
  const showPermissionsTab = member.role !== 'super_admin';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`relative bg-gradient-to-r ${ROLE_GRADIENT[member.role] || 'from-gray-600 to-gray-700'} p-6 flex-shrink-0`}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-4">
          <MemberAvatar member={member} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-white">{member.full_name}</h2>
              {member.role === 'super_admin' && (
                <Crown className="w-4 h-4 text-yellow-300" />
              )}
            </div>
            {member.nickname && (
              <p className="text-sm text-white/70 mt-0.5">&ldquo;{member.nickname}&rdquo;</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <RolePill role={member.role} />
              <StatusBadge active={member.active} />
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar — only show permissions tab for non-super-admin */}
      {showPermissionsTab && (
        <div className="flex gap-1 px-4 pt-4 flex-shrink-0 border-b border-gray-200 pb-0">
          {(['info', 'permissions'] as DetailTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 rounded-t-lg text-sm font-semibold transition-all capitalize ${
                tab === t
                  ? 'bg-violet-600 text-white'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {t === 'permissions' ? 'Feature Permissions' : 'Profile Info'}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-gray-50">
        {(tab === 'info' || !showPermissionsTab) && (
          <>
            {/* Profile Info */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Profile Info</h3>
              <ProfileInfoSection member={member} />
            </div>

            {/* Quick Actions */}
            <QuickActionsSection
              member={member}
              isSuperAdmin={isSuperAdmin}
              onEditPermissions={() => setTab('permissions')}
              onToggleActive={() => onToggleActive(member)}
            />

            {/* Grant Super Admin — only for super admins editing non-super-admin users */}
            {canGrant && (
              <div className="pt-2 border-t border-gray-200">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Crown className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-gray-900 mb-1">Elevate to Super Admin</h4>
                      <p className="text-xs text-gray-600 mb-3">
                        Grants full unrestricted platform access. Cannot be undone without manual database access.
                      </p>
                      <button
                        onClick={() => onGrantSuperAdmin(member)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
                      >
                        <Crown className="w-4 h-4" />
                        Grant Super Admin
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'permissions' && showPermissionsTab && (
          <div>
            {loadingFlags ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
              </div>
            ) : (
              <FeatureFlagsPanel
                userId={member.id}
                initialFlags={flags || {}}
                readOnly={!isSuperAdmin}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeamProfilesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [grantTarget, setGrantTarget] = useState<TeamMember | null>(null);
  const [grantSaving, setGrantSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    };
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/users', { headers });
      const json = await res.json();
      if (res.ok && json.data) {
        setMembers(json.data);
      }
    } catch (e) {
      console.error('Error fetching team members:', e);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      const role = user.user_metadata?.role || 'operator';
      setUserRole(role);

      const adminRoles = ['super_admin', 'operations_manager', 'admin'];
      if (!adminRoles.includes(role)) {
        router.push('/dashboard/admin');
        return;
      }

      await fetchMembers();
      setLoading(false);
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isSuperAdmin = userRole === 'super_admin';

  const handleGrantSuperAdmin = async () => {
    if (!grantTarget) return;
    setGrantSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/grant-super-admin', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: grantTarget.id }),
      });
      const json = await res.json();
      if (json.success) {
        setGrantTarget(null);
        setSelectedMember(null);
        setSuccessMsg(`${grantTarget.full_name} has been granted Super Admin access.`);
        setTimeout(() => setSuccessMsg(''), 4000);
        await fetchMembers();
      } else {
        alert(json.error || 'Failed to grant super admin');
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'An error occurred');
    } finally {
      setGrantSaving(false);
    }
  };

  const handleToggleActive = useCallback(async (member: TeamMember) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/users/${member.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ active: !member.active }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`${member.full_name} has been ${member.active ? 'deactivated' : 'activated'}.`);
        setTimeout(() => setSuccessMsg(''), 4000);
        await fetchMembers();
        setSelectedMember(null);
      } else {
        alert(json.error || 'Failed to update user status');
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'An error occurred');
    }
  }, [getAuthHeaders, fetchMembers]);

  // Filtered + sorted members
  const allRoles = Array.from(new Set(members.map(m => m.role)))
    .sort((a, b) => {
      const ai = ROLE_ORDER.indexOf(a);
      const bi = ROLE_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

  const filtered = members.filter(m => {
    if (roleFilter !== 'all' && m.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
    }
    return true;
  });

  const roleBreakdown = allRoles.reduce((acc, r) => {
    acc[r] = members.filter(m => m.role === r).length;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-white" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-violet-600 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/admin"
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-600"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-gray-900">Team Profiles</h1>
                <p className="text-xs text-gray-500 hidden sm:block">
                  {members.length} members &middot; Manage access &amp; feature permissions
                </p>
              </div>
            </div>
          </div>

          {isSuperAdmin && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-semibold text-sm transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Invite Member</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Success banner ──────────────────────────────────────── */}
      {successMsg && (
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pt-4">
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <p className="text-emerald-700 text-sm">{successMsg}</p>
          </div>
        </div>
      )}

      {/* ── Main layout ─────────────────────────────────────────── */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Staff', value: members.length, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Active', value: members.filter(m => m.active).length, icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Super Admins', value: members.filter(m => m.role === 'super_admin').length, icon: Crown, color: 'text-violet-400', bg: 'bg-violet-500/10' },
            { label: 'Roles In Use', value: allRoles.filter(r => roleBreakdown[r] > 0).length, icon: Shield, color: 'text-orange-400', bg: 'bg-orange-500/10' },
          ].map(stat => (
            <div key={stat.label} className="bg-[#13131a] rounded-xl border border-white/[0.08] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                </div>
                <div className={`w-9 h-9 ${stat.bg} rounded-lg flex items-center justify-center`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Two-column layout: list + detail */}
        <div className={`grid gap-6 ${selectedMember ? 'lg:grid-cols-[1fr,400px]' : 'grid-cols-1'}`}>

          {/* ── Member List ──────────────────────────────────────── */}
          <div className="bg-[#13131a] rounded-2xl border border-white/[0.08] overflow-hidden">
            {/* Search + filter toolbar */}
            <div className="p-4 border-b border-white/[0.07] space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>

              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setRoleFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    roleFilter === 'all'
                      ? 'bg-violet-600 text-white'
                      : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.09] hover:text-gray-200'
                  }`}
                >
                  All ({members.length})
                </button>
                {allRoles.filter(r => roleBreakdown[r] > 0).map(role => (
                  <button
                    key={role}
                    onClick={() => setRoleFilter(role)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      roleFilter === role
                        ? `bg-gradient-to-r ${ROLE_GRADIENT[role] || 'from-gray-500 to-gray-600'} text-white`
                        : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.09] hover:text-gray-200'
                    }`}
                  >
                    {getRoleLabel(role)} ({roleBreakdown[role]})
                  </button>
                ))}
              </div>
            </div>

            {/* Member rows */}
            {filtered.length === 0 ? (
              <div className="p-10 text-center">
                <Users className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">
                  {search || roleFilter !== 'all' ? 'No members match your filters.' : 'No team members yet.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {filtered.map(member => {
                  const isSelected = selectedMember?.id === member.id;
                  return (
                    <button
                      key={member.id}
                      onClick={() => setSelectedMember(isSelected ? null : member)}
                      className={`w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors border-l-2 ${
                        isSelected
                          ? 'bg-violet-900/25 border-violet-500'
                          : 'border-transparent hover:bg-white/[0.03] hover:border-violet-500/30'
                      }`}
                    >
                      <MemberAvatar member={member} size="md" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white text-sm">{member.full_name}</span>
                          {member.role === 'super_admin' && (
                            <Crown className="w-3 h-3 text-violet-400" />
                          )}
                          <RolePill role={member.role} />
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{member.email}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`w-2 h-2 rounded-full ${member.active ? 'bg-emerald-500' : 'bg-gray-600'}`} />
                        <ChevronRight className={`w-4 h-4 text-gray-600 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Detail Panel ─────────────────────────────────────── */}
          {selectedMember && (
            <div className="bg-[#13131a] rounded-2xl border border-white/[0.08] overflow-hidden flex flex-col max-h-[calc(100vh-200px)] sticky top-24">
              <MemberDetailPanel
                member={selectedMember}
                isSuperAdmin={isSuperAdmin}
                currentUserId={userId || ''}
                onClose={() => setSelectedMember(null)}
                onGrantSuperAdmin={setGrantTarget}
                onToggleActive={handleToggleActive}
                getAuthHeaders={getAuthHeaders}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {showInviteModal && (
        <InviteMemberModal
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            setSuccessMsg('Invitation sent successfully! The user will receive an email to set up their account.');
            setTimeout(() => setSuccessMsg(''), 5000);
            fetchMembers();
          }}
        />
      )}

      {grantTarget && (
        <GrantSuperAdminDialog
          member={grantTarget}
          onConfirm={handleGrantSuperAdmin}
          onCancel={() => setGrantTarget(null)}
          saving={grantSaving}
        />
      )}
    </div>
  );
}
