'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface AccessRequest {
  id: string;
  full_name: string;
  email: string;
  date_of_birth: string;
  position: string;
  status: 'pending' | 'approved' | 'denied';
  reviewed_by?: string;
  reviewed_at?: string;
  assigned_role?: 'admin' | 'operator';
  denial_reason?: string;
  created_at: string;
}

export default function AccessRequestsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'denied'>('pending');
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'operator' | 'apprentice'>('operator');
  const [denialReason, setDenialReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [adminPermissions, setAdminPermissions] = useState<string[]>([]);
  const [editActiveStatus, setEditActiveStatus] = useState(true);

  // Helper to get auth headers for API calls
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
    };
  };

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        // Get user role from session metadata or localStorage (avoids RLS issues with profiles table)
        const role = user.user_metadata?.role
          || (() => { try { const u = JSON.parse(localStorage.getItem('pontifex-user') || '{}'); return u.role; } catch { return null; } })()
          || 'operator';
        setUserRole(role);
      }
    };
    initUser();
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      console.log('🔍 Fetching access requests...');

      // Use API route to fetch requests (bypasses RLS issues)
      const headers = await getAuthHeaders();
      const response = await fetch('/api/access-requests/list', { headers });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch requests');
      }

      console.log('✅ Fetched requests:', result.data);
      setRequests(result.data || []);
    } catch (error: any) {
      console.error('❌ Error fetching requests:', error);
      alert(`Error loading access requests: ${error.message || 'Unknown error'}. Please check the console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: AccessRequest, role: 'admin' | 'operator' | 'apprentice') => {
    setProcessing(true);
    try {
      // Call API route to approve request and create user
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/access-requests/${request.id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          role: role,
          reviewedBy: userId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        alert(`Error: ${result.error || 'Failed to approve request'}`);
        setProcessing(false);
        return;
      }

      // Success!
      alert(`Success: ${result.message}\n\n${result.data.passwordResetSent ? 'A password reset email has been sent to the user.' : 'Note: Password reset email could not be sent. User may need to use "Forgot Password" flow.'}`);
      setShowApprovalModal(false);
      setSelectedRequest(null);
      fetchRequests();
    } catch (error: any) {
      console.error('Error approving request:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeny = async (request: AccessRequest) => {
    if (!denialReason.trim()) {
      alert('Please provide a reason for denial');
      return;
    }

    setProcessing(true);
    try {
      // Call API route to deny request
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/access-requests/${request.id}/deny`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          denialReason: denialReason,
          reviewedBy: userId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        alert(`Error: ${result.error || 'Failed to deny request'}`);
        setProcessing(false);
        return;
      }

      alert(`Denied: ${result.message}`);
      setShowApprovalModal(false);
      setSelectedRequest(null);
      setDenialReason('');
      fetchRequests();
    } catch (error: any) {
      console.error('Error denying request:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleRemove = async (request: AccessRequest) => {
    setProcessing(true);
    try {
      console.log(`🗑️ Removing request: ${request.id}`);

      // Call API route to delete request
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/access-requests/${request.id}/delete`, {
        method: 'POST',
        headers,
      });

      const result = await response.json();

      if (!response.ok) {
        alert(`Error: ${result.error || 'Failed to remove request'}`);
        setProcessing(false);
        return;
      }

      console.log('✅ Request removed successfully');
      fetchRequests();
    } catch (error: any) {
      console.error('Error removing request:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleEditUser = async () => {
    if (!selectedRequest) return;

    setProcessing(true);
    try {
      console.log(`✏️ Updating user: ${selectedRequest.email}`);

      // Call API route to update user profile
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/access-requests/${selectedRequest.id}/update-user`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          role: selectedRole,
          active: editActiveStatus,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        alert(`Error: ${result.error || 'Failed to update user'}`);
        setProcessing(false);
        return;
      }

      alert(`Success: User ${selectedRequest.full_name} has been updated!`);
      setShowEditModal(false);
      setSelectedRequest(null);
      fetchRequests();
    } catch (error: any) {
      console.error('Error updating user:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const filteredRequests = requests.filter(req =>
    filterStatus === 'all' ? true : req.status === filterStatus
  );

  const stats = {
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    denied: requests.filter(r => r.status === 'denied').length,
    total: requests.length
  };

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
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Access Requests
              </h1>
              <p className="text-gray-600 font-medium mt-1">Review and approve user access requests</p>
            </div>
          </div>

          {userRole === 'admin' && (
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg">
              ADMIN
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">Total Requests</p>
                <p className="text-4xl font-bold text-gray-800">{stats.total}</p>
              </div>
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">Pending</p>
                <p className="text-4xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <div className="w-14 h-14 bg-yellow-100 rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">Approved</p>
                <p className="text-4xl font-bold text-green-600">{stats.approved}</p>
              </div>
              <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">Denied</p>
                <p className="text-4xl font-bold text-red-600">{stats.denied}</p>
              </div>
              <div className="w-14 h-14 bg-red-100 rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-4 shadow-lg mb-6">
          <div className="flex gap-3">
            {['all', 'pending', 'approved', 'denied'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status as any)}
                className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                  filterStatus === status
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Requests List */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-2xl border-2 border-gray-200 p-12 text-center">
              <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-600">Loading requests...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-gray-200 p-12 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-700 mb-2">No {filterStatus !== 'all' && filterStatus} requests</h3>
              <p className="text-gray-500">There are currently no access requests {filterStatus !== 'all' && `with status: ${filterStatus}`}</p>
            </div>
          ) : (
            filteredRequests.map((request) => (
              <div
                key={request.id}
                className={`bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg hover:shadow-xl transition-all ${
                  request.status !== 'pending' ? 'cursor-pointer hover:border-blue-400' : ''
                }`}
                onClick={() => {
                  if (request.status === 'approved' || request.status === 'denied') {
                    setSelectedRequest(request);
                    setSelectedRole(request.assigned_role as any || 'operator');
                    setEditActiveStatus(true);
                    setShowEditModal(true);
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {request.status !== 'pending' && (
                      <div className="mb-3">
                        <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-3 py-1 rounded-full">
                          Click to edit user
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-xl font-bold text-gray-800">{request.full_name}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        request.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        request.status === 'approved' ? 'bg-green-100 text-green-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {request.status.toUpperCase()}
                      </span>
                      {request.assigned_role && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                          {request.assigned_role.toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Email</p>
                        <p className="text-sm font-semibold text-gray-800">{request.email}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Position</p>
                        <p className="text-sm font-semibold text-gray-800">{request.position}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Date of Birth</p>
                        <p className="text-sm font-semibold text-gray-800">{new Date(request.date_of_birth).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Requested</p>
                        <p className="text-sm font-semibold text-gray-800">{new Date(request.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>

                    {request.denial_reason && (
                      <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 mb-4">
                        <p className="text-xs text-red-600 font-semibold mb-1">Denial Reason:</p>
                        <p className="text-sm text-red-800">{request.denial_reason}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 ml-4" onClick={(e) => e.stopPropagation()}>
                    {request.status === 'pending' && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedRequest(request);
                            setSelectedRole('operator');
                            setShowApprovalModal(true);
                          }}
                          className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setSelectedRequest(request);
                            setShowApprovalModal(true);
                          }}
                          className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold hover:from-red-600 hover:to-red-700 transition-all shadow-lg hover:shadow-xl"
                        >
                          Deny
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleRemove(request)}
                      disabled={processing}
                      className="px-6 py-3 bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-xl font-semibold hover:from-gray-800 hover:to-gray-900 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Approval/Denial Modal */}
        {showApprovalModal && selectedRequest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6">
              <h3 className="text-2xl font-bold text-gray-800 mb-4">Review Access Request</h3>
              <p className="text-gray-600 mb-6">
                <strong>{selectedRequest.full_name}</strong> ({selectedRequest.email})
              </p>

              {/* Role Selection for Approval */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Select Role (for approval)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setSelectedRole('apprentice')}
                    className={`p-4 rounded-xl border-2 font-semibold transition-all ${
                      selectedRole === 'apprentice'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    Apprentice
                  </button>
                  <button
                    onClick={() => setSelectedRole('operator')}
                    className={`p-4 rounded-xl border-2 font-semibold transition-all ${
                      selectedRole === 'operator'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    Operator
                  </button>
                  <button
                    onClick={() => setSelectedRole('admin')}
                    className={`p-4 rounded-xl border-2 font-semibold transition-all ${
                      selectedRole === 'admin'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    Admin
                  </button>
                </div>
              </div>

              {/* Admin Permissions */}
              {selectedRole === 'admin' && (
                <div className="mb-6 p-4 bg-purple-50 border-2 border-purple-200 rounded-xl">
                  <label className="block text-sm font-semibold text-purple-900 mb-3">
                    Select Admin Permissions
                  </label>
                  <div className="space-y-2">
                    {[
                      { id: 'dispatch', label: 'Dispatch Scheduling' },
                      { id: 'project-board', label: 'Project Status Board' },
                      { id: 'analytics', label: 'Analytics' },
                      { id: 'equipment', label: 'All Equipment' },
                      { id: 'access-requests', label: 'Access Requests' },
                      { id: 'team', label: 'Team Management' },
                    ].map((perm) => (
                      <label key={perm.id} className="flex items-center gap-3 p-2 hover:bg-purple-100 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={adminPermissions.includes(perm.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAdminPermissions([...adminPermissions, perm.id]);
                            } else {
                              setAdminPermissions(adminPermissions.filter(p => p !== perm.id));
                            }
                          }}
                          className="w-5 h-5 accent-purple-600"
                        />
                        <span className="text-gray-700 font-medium">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-purple-700 mt-3">
                    Select which modules this admin can access
                  </p>
                </div>
              )}

              {/* Denial Reason */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Denial Reason (if denying)
                </label>
                <textarea
                  value={denialReason}
                  onChange={(e) => setDenialReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:outline-none text-gray-800"
                  placeholder="Enter reason for denial..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowApprovalModal(false);
                    setSelectedRequest(null);
                    setDenialReason('');
                  }}
                  disabled={processing}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeny(selectedRequest)}
                  disabled={processing || !denialReason.trim()}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 shadow-lg"
                >
                  {processing ? 'Processing...' : 'Deny'}
                </button>
                <button
                  onClick={() => handleApprove(selectedRequest, selectedRole)}
                  disabled={processing}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 shadow-lg"
                >
                  {processing ? 'Processing...' : `Approve as ${selectedRole}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {showEditModal && selectedRequest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6">
              <h3 className="text-2xl font-bold text-gray-800 mb-4">Edit User</h3>
              <p className="text-gray-600 mb-6">
                <strong>{selectedRequest.full_name}</strong> ({selectedRequest.email})
              </p>

              {/* Role Selection */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  User Role
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setSelectedRole('apprentice')}
                    className={`p-4 rounded-xl border-2 font-semibold transition-all ${
                      selectedRole === 'apprentice'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    Apprentice
                  </button>
                  <button
                    onClick={() => setSelectedRole('operator')}
                    className={`p-4 rounded-xl border-2 font-semibold transition-all ${
                      selectedRole === 'operator'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    Operator
                  </button>
                  <button
                    onClick={() => setSelectedRole('admin')}
                    className={`p-4 rounded-xl border-2 font-semibold transition-all ${
                      selectedRole === 'admin'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    Admin
                  </button>
                </div>
              </div>

              {/* Active Status Toggle */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Account Status
                </label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setEditActiveStatus(true)}
                    className={`flex-1 p-4 rounded-xl border-2 font-semibold transition-all ${
                      editActiveStatus
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Active
                    </div>
                  </button>
                  <button
                    onClick={() => setEditActiveStatus(false)}
                    className={`flex-1 p-4 rounded-xl border-2 font-semibold transition-all ${
                      !editActiveStatus
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Inactive
                    </div>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Inactive users cannot log in to the system
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedRequest(null);
                  }}
                  disabled={processing}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditUser}
                  disabled={processing}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 shadow-lg"
                >
                  {processing ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
