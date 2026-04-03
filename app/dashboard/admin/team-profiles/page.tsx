'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Users, UserPlus, Search, Shield, Crown,
  Star, Briefcase, User, Eye, Settings, X,
  AlertTriangle, CheckCircle2, Mail, Phone, Calendar,
  Loader2, ChevronRight, Activity,
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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_GRADIENT: Record<string, string> = {
  super_admin: 'from-purple-500 to-indigo-600',
  operations_manager: 'from-indigo-500 to-blue-600',
  admin: 'from-blue-500 to-cyan-600',
  supervisor: 'from-teal-500 to-emerald-600',
  salesman: 'from-orange-500 to-amber-600',
  shop_manager: 'from-cyan-500 to-blue-600',
  operator: 'from-green-500 to-emerald-600',
  apprentice: 'from-slate-400 to-slate-600',
};

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700 border-purple-200',
  operations_manager: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  admin: 'bg-blue-100 text-blue-700 border-blue-200',
  supervisor: 'bg-teal-100 text-teal-700 border-teal-200',
  salesman: 'bg-orange-100 text-orange-700 border-orange-200',
  shop_manager: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  operator: 'bg-green-100 text-green-700 border-green-200',
  apprentice: 'bg-slate-100 text-slate-600 border-slate-200',
};

const ROLE_ICON: Record<string, React.ElementType> = {
  super_admin: Crown,
  operations_manager: Shield,
  admin: Briefcase,
  supervisor: Eye,
  salesman: Star,
  shop_manager: Settings,
  operator: User,
  apprentice: User,
};

function formatRole(role: string) {
  return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ring-2 ring-gray-700`}
      />
    );
  }
  return (
    <div className={`${sizeClass} bg-gradient-to-br ${gradient} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {member.full_name.charAt(0).toUpperCase()}
    </div>
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-red-500/30 w-full max-w-sm">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Grant Super Admin</h3>
              <p className="text-sm text-gray-400">This action cannot be undone easily</p>
            </div>
          </div>

          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-300">
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
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl py-3 font-semibold transition-colors"
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

// ─── Member Detail Panel ──────────────────────────────────────────────────────

type DetailTab = 'info' | 'permissions';

function MemberDetailPanel({
  member,
  isSuperAdmin,
  currentUserId,
  onClose,
  onGrantSuperAdmin,
  getAuthHeaders,
}: {
  member: TeamMember;
  isSuperAdmin: boolean;
  currentUserId: string;
  onClose: () => void;
  onGrantSuperAdmin: (member: TeamMember) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}) {
  const [tab, setTab] = useState<DetailTab>('info');
  const [flags, setFlags] = useState<Partial<UserFeatureFlags> | null>(null);
  const [loadingFlags, setLoadingFlags] = useState(false);

  useEffect(() => {
    if (tab === 'permissions' && flags === null) {
      setLoadingFlags(true);
      getAuthHeaders().then(headers =>
        fetch(`/api/admin/user-flags/${member.id}`, { headers })
          .then(r => r.json())
          .then(json => {
            setFlags(json.data || {});
          })
          .catch(() => setFlags({}))
          .finally(() => setLoadingFlags(false))
      );
    }
  }, [tab, member.id, flags, getAuthHeaders]);

  const RoleIcon = ROLE_ICON[member.role] || User;
  const isOwnProfile = member.id === currentUserId;
  const canGrant = isSuperAdmin && !isOwnProfile && member.role !== 'super_admin';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-6 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-4">
          <MemberAvatar member={member} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">{member.full_name}</h2>
              {member.role === 'super_admin' && (
                <Crown className="w-4 h-4 text-purple-400" />
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${ROLE_BADGE[member.role] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                <RoleIcon className="w-3 h-3" />
                {formatRole(member.role)}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${member.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${member.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                {member.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-6 pt-4 flex-shrink-0">
        {(['info', 'permissions'] as DetailTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
              tab === t
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {t === 'permissions' ? 'Feature Permissions' : 'Profile Info'}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'info' && (
          <div className="space-y-4">
            {/* Contact */}
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 space-y-3">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Contact</h3>
              <div className="flex items-center gap-3 text-sm text-gray-300">
                <Mail className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span>{member.email}</span>
              </div>
              {(member.phone_number || member.phone) && (
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Phone className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span>{member.phone_number || member.phone}</span>
                </div>
              )}
              {member.created_at && (
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span>Joined {new Date(member.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Quick Actions</h3>
              <Link
                href={`/dashboard/admin/operator-profiles`}
                className="flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors"
              >
                <span className="text-sm text-gray-300">View Operator Profile & History</span>
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </Link>
              <Link
                href={`/dashboard/admin/timecards`}
                className="flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors"
              >
                <span className="text-sm text-gray-300">View Timecards</span>
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </Link>
            </div>

            {/* Grant Super Admin — only for super admins editing non-super-admin users */}
            {canGrant && (
              <div className="mt-6 pt-4 border-t border-gray-800">
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Crown className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-white mb-1">Elevate to Super Admin</h4>
                      <p className="text-xs text-gray-400 mb-3">
                        Grants full unrestricted platform access. This should only be used for
                        senior leadership. Cannot be undone without manual database access.
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
          </div>
        )}

        {tab === 'permissions' && (
          <div>
            {loadingFlags ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              </div>
            ) : member.role === 'super_admin' ? (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-6 text-center">
                <Crown className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <h3 className="text-white font-semibold mb-1">Super Admin</h3>
                <p className="text-gray-400 text-sm">
                  Super admins have unrestricted access to all platform features.
                  Individual feature flags are not applicable.
                </p>
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

      let role = user.user_metadata?.role || 'operator';
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
    } catch (e: any) {
      alert(e.message);
    } finally {
      setGrantSaving(false);
    }
  };

  // Filtered + sorted members
  const allRoles = Array.from(new Set(members.map(m => m.role)));
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-white" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-purple-400 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/admin"
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-gray-400"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-white">Team Profiles</h1>
                <p className="text-xs text-gray-500 hidden sm:block">
                  {members.length} members · Manage access & feature permissions
                </p>
              </div>
            </div>
          </div>

          {isSuperAdmin && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-sm transition-colors"
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
          <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            <p className="text-green-300 text-sm">{successMsg}</p>
          </div>
        </div>
      )}

      {/* ── Main layout ─────────────────────────────────────────── */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Staff', value: members.length, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Active', value: members.filter(m => m.active).length, icon: Activity, color: 'text-green-400', bg: 'bg-green-500/10' },
            { label: 'Super Admins', value: members.filter(m => m.role === 'super_admin').length, icon: Crown, color: 'text-purple-400', bg: 'bg-purple-500/10' },
            { label: 'Roles In Use', value: Object.values(roleBreakdown).filter(v => v > 0).length, icon: Shield, color: 'text-orange-400', bg: 'bg-orange-500/10' },
          ].map(stat => (
            <div key={stat.label} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
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
        <div className={`grid gap-6 ${selectedMember ? 'lg:grid-cols-[1fr,420px]' : 'grid-cols-1'}`}>

          {/* ── Member List ──────────────────────────────────────── */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            {/* Search + filter toolbar */}
            <div className="p-4 border-b border-gray-800 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setRoleFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    roleFilter === 'all' ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
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
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {formatRole(role)} ({roleBreakdown[role]})
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
              <div className="divide-y divide-gray-800">
                {filtered.map(member => {
                  const RoleIcon = ROLE_ICON[member.role] || User;
                  const isSelected = selectedMember?.id === member.id;
                  return (
                    <button
                      key={member.id}
                      onClick={() => setSelectedMember(isSelected ? null : member)}
                      className={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-800/60 transition-colors ${
                        isSelected ? 'bg-purple-500/10 border-l-2 border-purple-500' : ''
                      }`}
                    >
                      <MemberAvatar member={member} size="md" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white text-sm">{member.full_name}</span>
                          {member.role === 'super_admin' && (
                            <Crown className="w-3 h-3 text-purple-400" />
                          )}
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${ROLE_BADGE[member.role] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                            <RoleIcon className="w-2.5 h-2.5" />
                            {formatRole(member.role)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{member.email}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`w-1.5 h-1.5 rounded-full ${member.active ? 'bg-green-500' : 'bg-gray-600'}`} />
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
            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden flex flex-col max-h-[calc(100vh-200px)] sticky top-24">
              <MemberDetailPanel
                member={selectedMember}
                isSuperAdmin={isSuperAdmin}
                currentUserId={userId || ''}
                onClose={() => setSelectedMember(null)}
                onGrantSuperAdmin={setGrantTarget}
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
