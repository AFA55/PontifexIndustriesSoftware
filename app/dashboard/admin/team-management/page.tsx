'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  ROLES_WITH_LABELS,
  ADMIN_DASHBOARD_ROLES,
  ADMIN_CARDS,
  ALL_CARD_KEYS,
  BYPASS_ROLES,
  getRoleLabel,
  getDefaultPermissions,
  PERMISSION_LABELS,
  type PermissionLevel,
} from '@/lib/rbac';
import PermissionEditorModal from './_components/PermissionEditorModal';
import {
  ArrowLeft, Users, UserPlus, Shield, Bell, CheckCircle2,
  ChevronDown, ChevronUp, Search, Trash2, UserCheck, UserX,
  Settings, AlertCircle, X, Eye, Lock, Mail, KeyRound, User,
  Crown, Briefcase, Star, Activity,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface AccessRequest {
  id: string;
  full_name: string;
  email: string;
  date_of_birth: string;
  position: string;
  phone_number?: string;
  status: 'pending' | 'approved' | 'denied';
  reviewed_by?: string;
  reviewed_at?: string;
  assigned_role?: string;
  denial_reason?: string;
  created_at: string;
}

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
  phone_number?: string;
  created_at?: string;
}

// ============================================================
// Helpers
// ============================================================

const ROLE_GRADIENT: Record<string, string> = {
  super_admin: 'from-purple-500 to-indigo-600',
  operations_manager: 'from-indigo-500 to-blue-600',
  admin: 'from-blue-500 to-cyan-600',
  supervisor: 'from-teal-500 to-emerald-600',
  salesman: 'from-orange-500 to-amber-600',
  operator: 'from-green-500 to-emerald-600',
  apprentice: 'from-slate-400 to-slate-600',
};

const ROLE_LIGHT: Record<string, string> = {
  super_admin: 'bg-purple-50 text-purple-700 border-purple-200',
  operations_manager: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  admin: 'bg-blue-50 text-blue-700 border-blue-200',
  supervisor: 'bg-teal-50 text-teal-700 border-teal-200',
  salesman: 'bg-orange-50 text-orange-700 border-orange-200',
  operator: 'bg-green-50 text-green-700 border-green-200',
  apprentice: 'bg-slate-50 text-slate-600 border-slate-200',
};

const ROLE_ICON: Record<string, typeof Crown> = {
  super_admin: Crown,
  operations_manager: Shield,
  admin: Briefcase,
  supervisor: Eye,
  salesman: Star,
  operator: User,
  apprentice: User,
};

// ============================================================
// Component
// ============================================================

export default function TeamManagementPage() {
  const router = useRouter();

  // Auth state
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [userName, setUserName] = useState<string>('');

  // Data
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Access request UI
  const [requestsExpanded, setRequestsExpanded] = useState(true);
  const [requestFilter, setRequestFilter] = useState<'pending' | 'all'>('pending');
  const [denialReason, setDenialReason] = useState('');
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);

  // Permission modal
  const [showPermModal, setShowPermModal] = useState(false);
  const [permModalTarget, setPermModalTarget] = useState<{
    type: 'approve' | 'edit';
    name: string;
    email: string;
    currentRole: string;
    currentPermissions?: Record<string, PermissionLevel>;
    requestId?: string;
    userId?: string;
  } | null>(null);

  // Team directory filters
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Processing
  const [processing, setProcessing] = useState(false);

  // Create User modal
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '', password: '', full_name: '', role: 'operator',
    card_permissions: getDefaultPermissions('operator') as Record<string, PermissionLevel>,
    showPermissions: false,
  });
  const [createUserError, setCreateUserError] = useState('');

  // ============================================================
  // Auth helpers
  // ============================================================

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
    };
  }, []);

  // ============================================================
  // Initialization
  // ============================================================

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUserId(user.id);

      let role = 'operator';
      let name = '';
      try {
        const stored = localStorage.getItem('supabase-user');
        if (stored) {
          const parsed = JSON.parse(stored);
          role = parsed.role || 'operator';
          name = parsed.name || parsed.full_name || '';
        }
      } catch {
        // ignore
      }
      if (user.user_metadata?.role) {
        role = user.user_metadata.role;
      }
      if (user.user_metadata?.full_name) {
        name = user.user_metadata.full_name;
      }
      setUserRole(role);
      setUserName(name);

      if (!BYPASS_ROLES.includes(role)) {
        router.push('/dashboard/admin');
        return;
      }

      await Promise.all([fetchRequests(), fetchTeamMembers()]);
      setLoading(false);
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================
  // Data fetching
  // ============================================================

  const fetchRequests = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/access-requests/list', { headers });
      const json = await res.json();
      if (res.ok && json.data) {
        setRequests(json.data);
      }
    } catch (e) {
      console.error('Error fetching access requests:', e);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/users', { headers });
      const json = await res.json();
      if (res.ok && json.data) {
        setTeamMembers(json.data);
      }
    } catch (e) {
      console.error('Error fetching team members:', e);
    }
  };

  // ============================================================
  // Actions
  // ============================================================

  const handleApproveClick = (request: AccessRequest) => {
    setPermModalTarget({
      type: 'approve',
      name: request.full_name,
      email: request.email,
      currentRole: 'operator',
      requestId: request.id,
    });
    setShowPermModal(true);
  };

  const handleDenyClick = (request: AccessRequest) => {
    setSelectedRequest(request);
    setDenialReason('');
    setShowDenyModal(true);
  };

  const handleApproveConfirm = async (role: string, permissions: Record<string, PermissionLevel>) => {
    if (!permModalTarget?.requestId) return;
    setProcessing(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/access-requests/${permModalTarget.requestId}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          role,
          reviewedBy: userId,
          card_permissions: permissions,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Error: ${json.error || 'Failed to approve request'}`);
      } else {
        setShowPermModal(false);
        setPermModalTarget(null);
        await Promise.all([fetchRequests(), fetchTeamMembers()]);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleDenyConfirm = async () => {
    if (!selectedRequest || !denialReason.trim()) return;
    setProcessing(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/access-requests/${selectedRequest.id}/deny`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          denialReason,
          reviewedBy: userId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Error: ${json.error || 'Failed to deny request'}`);
      } else {
        setShowDenyModal(false);
        setSelectedRequest(null);
        setDenialReason('');
        await fetchRequests();
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveRequest = async (request: AccessRequest) => {
    if (!window.confirm(`Remove access request from ${request.full_name}? This cannot be undone.`)) return;
    setProcessing(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/access-requests/${request.id}/delete`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        await fetchRequests();
      } else {
        const json = await res.json();
        alert(`Error: ${json.error || 'Failed to remove request'}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleEditMember = async (member: TeamMember) => {
    let existingPerms: Record<string, PermissionLevel> | undefined;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/card-permissions?user_id=${member.id}`, { headers });
      const json = await res.json();
      if (res.ok && json.data) {
        existingPerms = json.data;
      }
    } catch {
      // ignore, will use preset
    }

    setPermModalTarget({
      type: 'edit',
      name: member.full_name,
      email: member.email,
      currentRole: member.role,
      currentPermissions: existingPerms,
      userId: member.id,
    });
    setShowPermModal(true);
  };

  const handleEditConfirm = async (role: string, permissions: Record<string, PermissionLevel>) => {
    if (!permModalTarget?.userId) return;
    setProcessing(true);
    try {
      const headers = await getAuthHeaders();

      const profileRes = await fetch(`/api/admin/card-permissions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: permModalTarget.userId,
          permissions,
        }),
      });
      if (!profileRes.ok) {
        const json = await profileRes.json();
        alert(`Error updating permissions: ${json.error}`);
        return;
      }

      const roleRes = await fetch(`/api/admin/users/${permModalTarget.userId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role, active: true }),
      });

      if (roleRes.status === 404) {
        console.warn('Role update endpoint not available, permissions saved only');
      } else if (!roleRes.ok) {
        const json = await roleRes.json();
        console.warn('Role update failed:', json.error);
      }

      setShowPermModal(false);
      setPermModalTarget(null);
      await fetchTeamMembers();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeactivate = async (member: TeamMember) => {
    if (!window.confirm(`Deactivate ${member.full_name}? They will no longer be able to log in.`)) return;
    setProcessing(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/users/${member.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ active: false }),
      });
      if (res.ok) {
        await fetchTeamMembers();
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateUser = async () => {
    setCreateUserError('');
    if (!newUser.email.trim() || !newUser.password || !newUser.full_name.trim()) {
      setCreateUserError('All fields are required.');
      return;
    }
    if (newUser.password.length < 8) {
      setCreateUserError('Password must be at least 8 characters.');
      return;
    }
    setProcessing(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: newUser.email.trim(),
          password: newUser.password,
          full_name: newUser.full_name.trim(),
          role: newUser.role,
          card_permissions: newUser.showPermissions ? newUser.card_permissions : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCreateUserError(json.error || 'Failed to create user');
      } else {
        setShowCreateUserModal(false);
        setNewUser({ email: '', password: '', full_name: '', role: 'operator', card_permissions: getDefaultPermissions('operator'), showPermissions: false });
        await fetchTeamMembers();
      }
    } catch (e: any) {
      setCreateUserError(e.message || 'Unexpected error');
    } finally {
      setProcessing(false);
    }
  };

  // ============================================================
  // Derived data
  // ============================================================

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const filteredRequests = requestFilter === 'pending'
    ? pendingRequests
    : requests;

  const filteredMembers = teamMembers.filter(m => {
    if (roleFilter !== 'all' && m.role !== roleFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        m.full_name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const allRoleValues = ROLES_WITH_LABELS.map(r => r.value);
  const roleBreakdown = allRoleValues.reduce((acc, role) => {
    acc[role] = teamMembers.filter(m => m.role === role).length;
    return acc;
  }, {} as Record<string, number>);

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse shadow-xl">
            <Users className="w-7 h-7 text-white" />
          </div>
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">Loading team data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Dark Header Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 border-b border-blue-800 sticky top-0 z-40 shadow-2xl">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/admin"
                className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-lg rounded-xl border border-white/20 transition-all text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-white">Team Management</h1>
                  <p className="text-xs text-blue-300 font-medium hidden sm:block">Manage access, roles & permissions</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {BYPASS_ROLES.includes(userRole) && (
                <button
                  onClick={() => { setShowCreateUserModal(true); setCreateUserError(''); setNewUser({ email: '', password: '', full_name: '', role: 'operator', card_permissions: getDefaultPermissions('operator'), showPermissions: false }); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl font-semibold text-sm shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Create User</span>
                </button>
              )}
              <div className="hidden sm:flex items-center gap-2.5 bg-white/10 backdrop-blur-lg px-4 py-2 rounded-xl border border-white/20">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-md">
                  {userName?.charAt(0) || 'A'}
                </div>
                <div>
                  <p className="text-xs font-bold text-white">{userName || 'Admin'}</p>
                  <p className="text-[10px] text-purple-300 font-semibold uppercase tracking-wider">{getRoleLabel(userRole)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 relative">

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <div className="bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 rounded-2xl p-4 sm:p-5 shadow-xl transform hover:scale-[1.02] transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-blue-100 uppercase tracking-wider">Total Staff</p>
                <p className="text-3xl sm:text-4xl font-bold text-white mt-1">{teamMembers.length}</p>
              </div>
              <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>

          <div className={`bg-gradient-to-br ${pendingRequests.length > 0 ? 'from-amber-500 via-orange-500 to-red-500' : 'from-emerald-500 via-green-500 to-teal-500'} rounded-2xl p-4 sm:p-5 shadow-xl transform hover:scale-[1.02] transition-all`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white/80 uppercase tracking-wider">Pending</p>
                <p className="text-3xl sm:text-4xl font-bold text-white mt-1">{pendingRequests.length}</p>
              </div>
              <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                {pendingRequests.length > 0 ? <Bell className="w-5 h-5 text-white" /> : <CheckCircle2 className="w-5 h-5 text-white" />}
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 rounded-2xl p-4 sm:p-5 shadow-xl transform hover:scale-[1.02] transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-emerald-100 uppercase tracking-wider">Active</p>
                <p className="text-3xl sm:text-4xl font-bold text-white mt-1">
                  {teamMembers.filter(m => m.active).length}
                </p>
              </div>
              <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-600 rounded-2xl p-4 sm:p-5 shadow-xl transform hover:scale-[1.02] transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 uppercase tracking-wider">Roles</p>
                <p className="text-3xl sm:text-4xl font-bold text-white mt-1">
                  {Object.values(roleBreakdown).filter(v => v > 0).length}
                </p>
              </div>
              <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Access Requests Section ──────────────────────────── */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/60 shadow-lg mb-6 overflow-hidden">
          <button
            onClick={() => setRequestsExpanded(!requestsExpanded)}
            className="w-full px-5 sm:px-6 py-4 flex items-center justify-between hover:bg-white/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-md">
                <Bell className="w-4 h-4 text-white" />
              </div>
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-bold text-gray-800">Access Requests</h2>
                {pendingRequests.length > 0 && (
                  <p className="text-xs text-amber-600 font-semibold">{pendingRequests.length} awaiting review</p>
                )}
              </div>
            </div>
            {requestsExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {requestsExpanded && (
            <div className="px-5 sm:px-6 pb-6">
              {/* Filter tabs */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setRequestFilter('pending')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    requestFilter === 'pending'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  Pending ({pendingRequests.length})
                </button>
                <button
                  onClick={() => setRequestFilter('all')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    requestFilter === 'all'
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  All ({requests.length})
                </button>
              </div>

              {filteredRequests.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-7 h-7 text-gray-300" />
                  </div>
                  <p className="text-gray-400 font-medium text-sm">
                    {requestFilter === 'pending' ? 'No pending access requests' : 'No access requests found'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRequests.map(request => (
                    <div
                      key={request.id}
                      className={`rounded-xl p-4 transition-all border ${
                        request.status === 'pending'
                          ? 'bg-gradient-to-r from-amber-50/50 to-orange-50/50 border-amber-200/60 hover:border-amber-300'
                          : request.status === 'approved'
                          ? 'bg-gradient-to-r from-green-50/50 to-emerald-50/50 border-green-200/60'
                          : 'bg-gradient-to-r from-red-50/50 to-rose-50/50 border-red-200/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-sm shadow-md ${
                            request.status === 'pending' ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                            request.status === 'approved' ? 'bg-gradient-to-br from-green-400 to-emerald-500' :
                            'bg-gradient-to-br from-red-400 to-rose-500'
                          }`}>
                            {request.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <h3 className="font-bold text-gray-800 text-sm">{request.full_name}</h3>
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                                request.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                request.status === 'approved' ? 'bg-green-100 text-green-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {request.status}
                              </span>
                              {request.assigned_role && (
                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                  ROLE_LIGHT[request.assigned_role] || 'bg-gray-100 text-gray-600 border-gray-200'
                                }`}>
                                  {getRoleLabel(request.assigned_role)}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-3 text-xs text-gray-500 flex-wrap">
                              <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{request.email}</span>
                              <span>{request.position}</span>
                              <span>Applied {new Date(request.created_at).toLocaleDateString()}</span>
                            </div>
                            {request.denial_reason && (
                              <div className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5 flex items-start gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                <span>Denied: {request.denial_reason}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2 flex-shrink-0">
                          {request.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApproveClick(request)}
                                disabled={processing}
                                className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl text-xs font-bold hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50 shadow-md hover:shadow-lg"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                Approve
                              </button>
                              <button
                                onClick={() => handleDenyClick(request)}
                                disabled={processing}
                                className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl text-xs font-bold hover:from-red-600 hover:to-rose-700 transition-all disabled:opacity-50 shadow-md hover:shadow-lg"
                              >
                                <UserX className="w-3.5 h-3.5" />
                                Deny
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleRemoveRequest(request)}
                            disabled={processing}
                            className="p-2 bg-white/80 text-gray-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all disabled:opacity-50 border border-gray-200"
                            title="Remove request"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Team Directory Section ──────────────────────────── */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/60 shadow-lg overflow-hidden">
          <div className="px-5 sm:px-6 py-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-800">Team Directory</h2>
                  <p className="text-xs text-gray-400 font-medium">
                    {filteredMembers.length} of {teamMembers.length} members
                  </p>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50/80 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 text-gray-800 placeholder-gray-400 transition-all"
                />
              </div>

              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setRoleFilter('all')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    roleFilter === 'all'
                      ? 'bg-gradient-to-r from-gray-800 to-gray-900 text-white shadow-md'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                {allRoleValues.filter(role => roleBreakdown[role] > 0).map(role => {
                  const count = roleBreakdown[role];
                  return (
                    <button
                      key={role}
                      onClick={() => setRoleFilter(role)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                        roleFilter === role
                          ? `bg-gradient-to-r ${ROLE_GRADIENT[role] || 'from-gray-500 to-gray-600'} text-white shadow-md`
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {getRoleLabel(role)}
                      {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Team Members */}
          {filteredMembers.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-gray-500 font-semibold">No team members found</p>
              <p className="text-gray-400 text-xs mt-1">
                {searchQuery || roleFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Team members will appear here'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredMembers.map(member => {
                const RoleIcon = ROLE_ICON[member.role] || User;
                return (
                  <div
                    key={member.id}
                    className="px-5 sm:px-6 py-4 hover:bg-blue-50/30 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-10 h-10 bg-gradient-to-br ${ROLE_GRADIENT[member.role] || 'from-gray-400 to-gray-500'} rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0`}>
                          {member.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-800 text-sm">{member.full_name}</span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                              ROLE_LIGHT[member.role] || 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                              <RoleIcon className="w-2.5 h-2.5" />
                              {getRoleLabel(member.role)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 truncate">{member.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Status */}
                        {member.active ? (
                          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[11px] font-bold border border-emerald-200">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                            Active
                          </span>
                        ) : (
                          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 text-gray-400 rounded-lg text-[11px] font-bold border border-gray-200">
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
                            Inactive
                          </span>
                        )}

                        {/* Actions */}
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleEditMember(member)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-all border border-blue-200/60"
                          >
                            <Settings className="w-3 h-3" />
                            <span className="hidden sm:inline">Permissions</span>
                          </button>
                          {member.active && member.id !== userId && (
                            <button
                              onClick={() => handleDeactivate(member)}
                              disabled={processing}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-bold hover:bg-red-100 transition-all disabled:opacity-50 border border-red-200/60"
                            >
                              <Lock className="w-3 h-3" />
                              <span className="hidden sm:inline">Deactivate</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────── */}

      {/* Permission Editor Modal */}
      {showPermModal && permModalTarget && (
        <PermissionEditorModal
          userName={permModalTarget.name}
          userEmail={permModalTarget.email}
          initialRole={permModalTarget.currentRole}
          initialPermissions={permModalTarget.currentPermissions}
          editorRole={userRole}
          onSave={permModalTarget.type === 'approve' ? handleApproveConfirm : handleEditConfirm}
          onCancel={() => {
            setShowPermModal(false);
            setPermModalTarget(null);
          }}
          saving={processing}
          title={permModalTarget.type === 'approve' ? 'Approve & Set Permissions' : 'Edit Permissions'}
        />
      )}

      {/* Deny Modal */}
      {showDenyModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                    <UserX className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Deny Request</h3>
                </div>
                <button
                  onClick={() => { setShowDenyModal(false); setSelectedRequest(null); setDenialReason(''); }}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-9 h-9 bg-gradient-to-br from-red-400 to-rose-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                  {selectedRequest.full_name.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-sm">{selectedRequest.full_name}</p>
                  <p className="text-xs text-gray-500">{selectedRequest.email}</p>
                </div>
              </div>

              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Reason for Denial <span className="text-red-500">*</span>
              </label>
              <textarea
                value={denialReason}
                onChange={e => setDenialReason(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-red-400 focus:ring-2 focus:ring-red-500/20 focus:outline-none text-gray-800 text-sm transition-all"
                placeholder="Explain why this request is being denied..."
              />

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setShowDenyModal(false); setSelectedRequest(null); setDenialReason(''); }}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-all disabled:opacity-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDenyConfirm}
                  disabled={processing || !denialReason.trim()}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-bold hover:from-red-600 hover:to-rose-700 transition-all disabled:opacity-50 shadow-lg text-sm flex items-center justify-center gap-2"
                >
                  <UserX className="w-4 h-4" />
                  {processing ? 'Denying...' : 'Deny Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                    <UserPlus className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Create New User</h3>
                </div>
                <button
                  onClick={() => setShowCreateUserModal(false)}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {createUserError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{createUserError}</span>
                </div>
              )}

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-gray-500" /> Full Name
                </label>
                <input
                  type="text"
                  value={newUser.full_name}
                  onChange={e => setNewUser(u => ({ ...u, full_name: e.target.value }))}
                  placeholder="e.g. John Smith"
                  className="w-full px-4 py-3.5 border-2 border-gray-300 rounded-xl text-base text-gray-900 font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all placeholder-gray-400 bg-gray-50"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-gray-500" /> Email
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))}
                  placeholder="user@company.com"
                  className="w-full px-4 py-3.5 border-2 border-gray-300 rounded-xl text-base text-gray-900 font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all placeholder-gray-400 bg-gray-50"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-gray-500" /> Password <span className="text-gray-400 font-normal text-xs">(min 8 chars)</span>
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                  placeholder="Enter password"
                  className="w-full px-4 py-3.5 border-2 border-gray-300 rounded-xl text-base text-gray-900 font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all placeholder-gray-400 bg-gray-50"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-gray-500" /> Role
                </label>
                <select
                  value={newUser.role}
                  onChange={e => {
                    const role = e.target.value;
                    setNewUser(u => ({ ...u, role, card_permissions: getDefaultPermissions(role) }));
                  }}
                  className="w-full px-4 py-3.5 border-2 border-gray-300 rounded-xl text-base text-gray-900 font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all bg-gray-50"
                >
                  {ROLES_WITH_LABELS.map(r => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Permissions Section */}
              {!BYPASS_ROLES.includes(newUser.role) && (
                <div className="border-t border-gray-200 pt-4">
                  <button
                    type="button"
                    onClick={() => setNewUser(u => ({ ...u, showPermissions: !u.showPermissions }))}
                    className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Settings className="w-4 h-4 text-gray-500" />
                      Customize Permissions
                    </span>
                    {newUser.showPermissions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {!newUser.showPermissions && (
                    <p className="text-xs text-gray-400 mt-1">Using default permissions for {getRoleLabel(newUser.role)}</p>
                  )}

                  {newUser.showPermissions && (
                    <div className="mt-3 space-y-2">
                      {ADMIN_CARDS.map(card => {
                        const level = newUser.card_permissions[card.key] || 'none';
                        return (
                          <div key={card.key} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-200">
                            <span className="text-xs font-semibold text-gray-700 truncate mr-3">{card.title}</span>
                            <div className="flex gap-1 flex-shrink-0">
                              {(['none', 'view', 'full'] as PermissionLevel[]).map(pl => (
                                <button
                                  key={pl}
                                  type="button"
                                  onClick={() => setNewUser(u => ({
                                    ...u,
                                    card_permissions: { ...u.card_permissions, [card.key]: pl },
                                  }))}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                                    level === pl
                                      ? pl === 'full' ? 'bg-emerald-500 text-white shadow-sm'
                                        : pl === 'view' ? 'bg-blue-500 text-white shadow-sm'
                                        : 'bg-gray-400 text-white shadow-sm'
                                      : 'bg-white text-gray-400 border border-gray-200 hover:bg-gray-100'
                                  }`}
                                >
                                  {pl === 'none' ? 'None' : pl === 'view' ? 'View' : 'Full'}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {BYPASS_ROLES.includes(newUser.role) && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-700 font-medium flex items-center gap-2">
                  <Crown className="w-4 h-4 flex-shrink-0" />
                  This role has full access to all modules automatically.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreateUserModal(false)}
                  disabled={processing}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-all disabled:opacity-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={processing || !newUser.email.trim() || !newUser.password || !newUser.full_name.trim()}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50 shadow-lg text-sm flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  {processing ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
