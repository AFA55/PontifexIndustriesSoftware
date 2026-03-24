'use client';

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div className="animate-spin w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm font-medium">Loading team data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/admin"
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-600"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-bold text-gray-900">Team Management</h1>
                  <p className="text-xs text-gray-500 hidden sm:block">Manage access, roles & permissions</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {BYPASS_ROLES.includes(userRole) && (
                <button
                  onClick={() => { setShowCreateUserModal(true); setCreateUserError(''); setNewUser({ email: '', password: '', full_name: '', role: 'operator', card_permissions: getDefaultPermissions('operator'), showPermissions: false }); }}
                  className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg font-semibold text-sm transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Create User</span>
                </button>
              )}
              <div className="hidden sm:flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg">
                <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-md flex items-center justify-center text-white font-bold text-xs">
                  {userName?.charAt(0) || 'A'}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-900">{userName || 'Admin'}</p>
                  <p className="text-[10px] text-gray-500 font-medium">{getRoleLabel(userRole)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6">

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Staff</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{teamMembers.length}</p>
              </div>
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending</p>
                <p className={`text-2xl font-bold mt-1 ${pendingRequests.length > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{pendingRequests.length}</p>
              </div>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${pendingRequests.length > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                {pendingRequests.length > 0 ? <Bell className="w-4 h-4 text-amber-600" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {teamMembers.filter(m => m.active).length}
                </p>
              </div>
              <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
                <Activity className="w-4 h-4 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Roles</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {Object.values(roleBreakdown).filter(v => v > 0).length}
                </p>
              </div>
              <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center">
                <Shield className="w-4 h-4 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Access Requests Section ──────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
          <button
            onClick={() => setRequestsExpanded(!requestsExpanded)}
            className="w-full px-4 sm:px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                <Bell className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-left">
                <h2 className="text-sm sm:text-base font-bold text-gray-900">Access Requests</h2>
                {pendingRequests.length > 0 && (
                  <p className="text-xs text-amber-600 font-medium">{pendingRequests.length} awaiting review</p>
                )}
              </div>
            </div>
            {requestsExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {requestsExpanded && (
            <div className="px-4 sm:px-5 pb-4">
              {/* Filter tabs */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setRequestFilter('pending')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    requestFilter === 'pending'
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  Pending ({pendingRequests.length})
                </button>
                <button
                  onClick={() => setRequestFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    requestFilter === 'all'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  All ({requests.length})
                </button>
              </div>

              {filteredRequests.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <CheckCircle2 className="w-5 h-5 text-gray-300" />
                  </div>
                  <p className="text-gray-400 text-sm">
                    {requestFilter === 'pending' ? 'No pending access requests' : 'No access requests found'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredRequests.map(request => (
                    <div
                      key={request.id}
                      className={`rounded-lg p-3 transition-all border ${
                        request.status === 'pending'
                          ? 'bg-amber-50/50 border-amber-200 hover:border-amber-300'
                          : request.status === 'approved'
                          ? 'bg-green-50/50 border-green-200'
                          : 'bg-red-50/50 border-red-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold text-xs ${
                            request.status === 'pending' ? 'bg-amber-500' :
                            request.status === 'approved' ? 'bg-green-500' :
                            'bg-red-500'
                          }`}>
                            {request.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <h3 className="font-semibold text-gray-900 text-sm">{request.full_name}</h3>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                request.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                request.status === 'approved' ? 'bg-green-100 text-green-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {request.status}
                              </span>
                              {request.assigned_role && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
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
                              <div className="mt-1.5 text-xs text-red-600 bg-red-50 rounded-md px-2.5 py-1 flex items-start gap-1.5">
                                <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                <span>Denied: {request.denial_reason}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-1.5 flex-shrink-0">
                          {request.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApproveClick(request)}
                                disabled={processing}
                                className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg text-xs font-semibold hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50"
                              >
                                <UserCheck className="w-3 h-3" />
                                Approve
                              </button>
                              <button
                                onClick={() => handleDenyClick(request)}
                                disabled={processing}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                              >
                                <UserX className="w-3 h-3" />
                                Deny
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleRemoveRequest(request)}
                            disabled={processing}
                            className="p-1.5 bg-white text-gray-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-all disabled:opacity-50 border border-gray-200"
                            title="Remove request"
                          >
                            <Trash2 className="w-3 h-3" />
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-gray-900">Team Directory</h2>
                  <p className="text-xs text-gray-500">
                    {filteredMembers.length} of {teamMembers.length} members
                  </p>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-gray-900 bg-white placeholder-gray-400 transition-all"
                />
              </div>

              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setRoleFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    roleFilter === 'all'
                      ? 'bg-gray-800 text-white'
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        roleFilter === role
                          ? `bg-gradient-to-r ${ROLE_GRADIENT[role] || 'from-gray-500 to-gray-600'} text-white`
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
            <div className="p-8 text-center">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <Users className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-gray-500 text-sm font-medium">No team members found</p>
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
                    className="px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className={`w-8 h-8 bg-gradient-to-br ${ROLE_GRADIENT[member.role] || 'from-gray-400 to-gray-500'} rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                          {member.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm">{member.full_name}</span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                              ROLE_LIGHT[member.role] || 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                              <RoleIcon className="w-2.5 h-2.5" />
                              {getRoleLabel(member.role)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate">{member.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Status */}
                        {member.active ? (
                          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-600 rounded text-[10px] font-semibold border border-green-200">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                            Active
                          </span>
                        ) : (
                          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-400 rounded text-[10px] font-semibold border border-gray-200">
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
                            Inactive
                          </span>
                        )}

                        {/* Actions */}
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleEditMember(member)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-all border border-blue-200"
                          >
                            <Settings className="w-3 h-3" />
                            <span className="hidden sm:inline">Permissions</span>
                          </button>
                          {member.active && member.id !== userId && (
                            <button
                              onClick={() => handleDeactivate(member)}
                              disabled={processing}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-semibold hover:bg-red-100 transition-all disabled:opacity-50 border border-red-200"
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-lg border border-gray-200 overflow-hidden">
            <div className="bg-red-500 px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserX className="w-4 h-4 text-white" />
                  <h3 className="text-sm font-bold text-white">Deny Request</h3>
                </div>
                <button
                  onClick={() => { setShowDenyModal(false); setSelectedRequest(null); setDenialReason(''); }}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2.5 mb-3 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">
                  {selectedRequest.full_name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{selectedRequest.full_name}</p>
                  <p className="text-xs text-gray-500">{selectedRequest.email}</p>
                </div>
              </div>

              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Reason for Denial <span className="text-red-500">*</span>
              </label>
              <textarea
                value={denialReason}
                onChange={e => setDenialReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-red-400 focus:ring-1 focus:ring-red-200 focus:outline-none text-gray-900 text-sm transition-all bg-white"
                placeholder="Explain why this request is being denied..."
              />

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setShowDenyModal(false); setSelectedRequest(null); setDenialReason(''); }}
                  disabled={processing}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg font-semibold hover:bg-gray-200 transition-all disabled:opacity-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDenyConfirm}
                  disabled={processing || !denialReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2"
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full shadow-lg border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-white" />
                  <h3 className="text-sm font-bold text-white">Create New User</h3>
                </div>
                <button
                  onClick={() => setShowCreateUserModal(false)}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {createUserError && (
                <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{createUserError}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Full Name
                </label>
                <input
                  type="text"
                  value={newUser.full_name}
                  onChange={e => setNewUser(u => ({ ...u, full_name: e.target.value }))}
                  placeholder="e.g. John Smith"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-1 focus:ring-blue-200 focus:border-blue-500 transition-all placeholder-gray-400 bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Email
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))}
                  placeholder="user@company.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-1 focus:ring-blue-200 focus:border-blue-500 transition-all placeholder-gray-400 bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Password <span className="text-gray-400 font-normal normal-case">(min 8 chars)</span>
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                  placeholder="Enter password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-1 focus:ring-blue-200 focus:border-blue-500 transition-all placeholder-gray-400 bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Role
                </label>
                <select
                  value={newUser.role}
                  onChange={e => {
                    const role = e.target.value;
                    setNewUser(u => ({ ...u, role, card_permissions: getDefaultPermissions(role) }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-1 focus:ring-blue-200 focus:border-blue-500 transition-all bg-white"
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
                <div className="border-t border-gray-200 pt-3">
                  <button
                    type="button"
                    onClick={() => setNewUser(u => ({ ...u, showPermissions: !u.showPermissions }))}
                    className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Settings className="w-3.5 h-3.5 text-gray-500" />
                      Customize Permissions
                    </span>
                    {newUser.showPermissions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {!newUser.showPermissions && (
                    <p className="text-xs text-gray-400 mt-1">Using default permissions for {getRoleLabel(newUser.role)}</p>
                  )}

                  {newUser.showPermissions && (
                    <div className="mt-2 space-y-1.5">
                      {ADMIN_CARDS.map(card => {
                        const level = newUser.card_permissions[card.key] || 'none';
                        return (
                          <div key={card.key} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                            <span className="text-xs font-semibold text-gray-700 truncate mr-3">{card.title}</span>
                            <div className="flex gap-1 flex-shrink-0">
                              {(['none', 'view', 'submit', 'full'] as PermissionLevel[]).map(pl => (
                                <button
                                  key={pl}
                                  type="button"
                                  onClick={() => setNewUser(u => ({
                                    ...u,
                                    card_permissions: { ...u.card_permissions, [card.key]: pl },
                                  }))}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                                    level === pl
                                      ? pl === 'full' ? 'bg-emerald-500 text-white shadow-sm'
                                        : pl === 'submit' ? 'bg-blue-500 text-white shadow-sm'
                                        : pl === 'view' ? 'bg-amber-500 text-white shadow-sm'
                                        : 'bg-gray-400 text-white shadow-sm'
                                      : 'bg-white text-gray-400 border border-gray-200 hover:bg-gray-100'
                                  }`}
                                >
                                  {pl === 'none' ? 'None' : pl === 'view' ? 'View' : pl === 'submit' ? 'Submit' : 'Full'}
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
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5 text-xs text-purple-700 flex items-center gap-2">
                  <Crown className="w-3.5 h-3.5 flex-shrink-0" />
                  This role has full access to all modules automatically.
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowCreateUserModal(false)}
                  disabled={processing}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg font-semibold hover:bg-gray-200 transition-all disabled:opacity-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={processing || !newUser.email.trim() || !newUser.password || !newUser.full_name.trim()}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2"
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
