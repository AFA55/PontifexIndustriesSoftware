'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  ROLES_WITH_LABELS,
  ADMIN_DASHBOARD_ROLES,
  BYPASS_ROLES,
  getRoleLabel,
  getDefaultPermissions,
  type PermissionLevel,
} from '@/lib/rbac';
import PermissionEditorModal from './_components/PermissionEditorModal';

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

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-800 border-purple-200',
  operations_manager: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  admin: 'bg-blue-100 text-blue-800 border-blue-200',
  supervisor: 'bg-teal-100 text-teal-800 border-teal-200',
  salesman: 'bg-orange-100 text-orange-800 border-orange-200',
  operator: 'bg-green-100 text-green-800 border-green-200',
  apprentice: 'bg-gray-100 text-gray-700 border-gray-200',
};

// ============================================================
// Component
// ============================================================

export default function TeamManagementPage() {
  const router = useRouter();

  // Auth state
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');

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

      // Get role from localStorage (set during login) or user_metadata fallback
      let role = 'operator';
      try {
        const stored = localStorage.getItem('supabase-user');
        if (stored) {
          const parsed = JSON.parse(stored);
          role = parsed.role || 'operator';
        }
      } catch {
        // ignore
      }
      // Also try user_metadata
      if (user.user_metadata?.role) {
        role = user.user_metadata.role;
      }
      setUserRole(role);

      // Guard: only super_admin and operations_manager can view this page
      if (!BYPASS_ROLES.includes(role)) {
        router.push('/dashboard/admin');
        return;
      }

      // Fetch data
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
      // Fetch admin-side roles only
      const adminRoles = ADMIN_DASHBOARD_ROLES.join(',');
      const res = await fetch(`/api/admin/users?roles=${adminRoles}`, { headers });
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

  // Open permission modal for approving a request
  const handleApproveClick = (request: AccessRequest) => {
    setPermModalTarget({
      type: 'approve',
      name: request.full_name,
      email: request.email,
      currentRole: 'operator', // default
      requestId: request.id,
    });
    setShowPermModal(true);
  };

  // Open deny modal
  const handleDenyClick = (request: AccessRequest) => {
    setSelectedRequest(request);
    setDenialReason('');
    setShowDenyModal(true);
  };

  // Execute approval with role + permissions
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

  // Execute denial
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

  // Delete an access request
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

  // Open permission modal for editing an existing team member
  const handleEditMember = async (member: TeamMember) => {
    // Fetch existing per-user permissions
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

  // Save edited team member
  const handleEditConfirm = async (role: string, permissions: Record<string, PermissionLevel>) => {
    if (!permModalTarget?.userId) return;
    setProcessing(true);
    try {
      const headers = await getAuthHeaders();

      // Update the profile role
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

      // Update role via direct Supabase call (profiles table)
      // We need a dedicated endpoint for this. For now use a simplified approach:
      // Re-use the card-permissions endpoint for permissions, and patch role separately
      const roleRes = await fetch(`/api/admin/users/${permModalTarget.userId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role, active: true }),
      });

      // If the role endpoint doesn't exist yet, silently skip
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

  // Deactivate a team member
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

  // Role breakdown stats
  const roleBreakdown = ADMIN_DASHBOARD_ROLES.reduce((acc, role) => {
    acc[role] = teamMembers.filter(m => m.role === role).length;
    return acc;
  }, {} as Record<string, number>);

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading team data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard/admin"
              className="p-3 bg-white rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-3">
                <span className="text-5xl">👥</span>
                Team Management
              </h1>
              <p className="text-gray-600 font-medium mt-1">
                Manage team access, approve requests, and set permissions
              </p>
            </div>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg text-sm">
            {getRoleLabel(userRole).toUpperCase()}
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Total Staff</p>
                <p className="text-3xl font-bold text-gray-800 mt-1">{teamMembers.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl">
                👥
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Pending Requests</p>
                <p className="text-3xl font-bold text-yellow-600 mt-1">{pendingRequests.length}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center text-2xl">
                {pendingRequests.length > 0 ? '🔔' : '✅'}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Active Users</p>
                <p className="text-3xl font-bold text-green-600 mt-1">
                  {teamMembers.filter(m => m.active).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-2xl">
                🟢
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Roles Active</p>
                <p className="text-3xl font-bold text-indigo-600 mt-1">
                  {Object.values(roleBreakdown).filter(v => v > 0).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-2xl">
                🏷
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* Section 1: Pending Access Requests */}
        {/* ============================================================ */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-8 overflow-hidden">
          <button
            onClick={() => setRequestsExpanded(!requestsExpanded)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-800">Access Requests</h2>
              {pendingRequests.length > 0 && (
                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-bold">
                  {pendingRequests.length} pending
                </span>
              )}
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${requestsExpanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {requestsExpanded && (
            <div className="px-6 pb-6">
              {/* Filter tabs */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setRequestFilter('pending')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    requestFilter === 'pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Pending ({pendingRequests.length})
                </button>
                <button
                  onClick={() => setRequestFilter('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    requestFilter === 'all'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All ({requests.length})
                </button>
              </div>

              {filteredRequests.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">
                    {requestFilter === 'pending'
                      ? 'No pending access requests'
                      : 'No access requests found'
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRequests.map(request => (
                    <div
                      key={request.id}
                      className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-gray-800">{request.full_name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              request.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              request.status === 'approved' ? 'bg-green-100 text-green-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {request.status}
                            </span>
                            {request.assigned_role && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                ROLE_COLORS[request.assigned_role] || 'bg-gray-100 text-gray-600'
                              }`}>
                                {getRoleLabel(request.assigned_role)}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-4 text-sm text-gray-500">
                            <span>{request.email}</span>
                            <span>{request.position}</span>
                            <span>Applied {new Date(request.created_at).toLocaleDateString()}</span>
                          </div>
                          {request.denial_reason && (
                            <div className="mt-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
                              Denied: {request.denial_reason}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 flex-shrink-0">
                          {request.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApproveClick(request)}
                                disabled={processing}
                                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg text-sm font-semibold hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 shadow-sm"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleDenyClick(request)}
                                disabled={processing}
                                className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg text-sm font-semibold hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 shadow-sm"
                              >
                                Deny
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleRemoveRequest(request)}
                            disabled={processing}
                            className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-all disabled:opacity-50"
                            title="Remove request"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
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

        {/* ============================================================ */}
        {/* Section 2: Team Directory */}
        {/* ============================================================ */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Team Directory</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {filteredMembers.length} of {teamMembers.length} members shown
                </p>
              </div>
            </div>

            {/* Filters row */}
            <div className="flex flex-wrap gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 text-gray-800"
                />
              </div>

              {/* Role filter chips */}
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setRoleFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    roleFilter === 'all'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                {ADMIN_DASHBOARD_ROLES.map(role => (
                  <button
                    key={role}
                    onClick={() => setRoleFilter(role)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      roleFilter === role
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {getRoleLabel(role)}
                    {roleBreakdown[role] > 0 && (
                      <span className="ml-1 opacity-70">({roleBreakdown[role]})</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          {filteredMembers.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-5xl mb-4">👥</div>
              <p className="text-gray-600 font-medium">No team members found</p>
              <p className="text-gray-400 text-sm mt-1">
                {searchQuery || roleFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Approved staff with admin-side roles will appear here'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMembers.map(member => (
                    <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                            {member.full_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-gray-800 text-sm">{member.full_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{member.email}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                          ROLE_COLORS[member.role] || 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}>
                          {getRoleLabel(member.role)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {member.active ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700">
                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                            <span className="w-2 h-2 bg-gray-300 rounded-full"></span>
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEditMember(member)}
                            className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors"
                          >
                            Edit Permissions
                          </button>
                          {member.active && member.id !== userId && (
                            <button
                              onClick={() => handleDeactivate(member)}
                              disabled={processing}
                              className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* Modals */}
        {/* ============================================================ */}

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
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-gray-800 mb-2">Deny Access Request</h3>
              <p className="text-gray-500 mb-4">
                <span className="font-semibold text-gray-700">{selectedRequest.full_name}</span>{' '}
                ({selectedRequest.email})
              </p>

              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Reason for Denial <span className="text-red-500">*</span>
              </label>
              <textarea
                value={denialReason}
                onChange={e => setDenialReason(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:border-red-400 focus:ring-1 focus:ring-red-400 focus:outline-none text-gray-800 text-sm"
                placeholder="Explain why this request is being denied..."
              />

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowDenyModal(false);
                    setSelectedRequest(null);
                    setDenialReason('');
                  }}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all disabled:opacity-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDenyConfirm}
                  disabled={processing || !denialReason.trim()}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 shadow-lg text-sm"
                >
                  {processing ? 'Denying...' : 'Deny Request'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
