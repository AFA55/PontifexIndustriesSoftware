'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';

interface AccessRequest {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
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
  const [user, setUser] = useState<User | null>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'denied'>('pending');
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'operator'>('operator');
  const [denialReason, setDenialReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      console.log('🔍 Fetching access requests...');

      const { data, error } = await supabase
        .from('access_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Supabase error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        throw error;
      }

      console.log('✅ Fetched requests:', data);
      setRequests(data || []);
    } catch (error: any) {
      console.error('❌ Error fetching requests:', error);
      alert(`Error loading access requests: ${error.message || 'Unknown error'}. Please check the console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: AccessRequest, role: 'admin' | 'operator') => {
    setProcessing(true);
    try {
      // 1. Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: request.email,
        password: request.password_hash,
      });

      if (authError) {
        alert(`Error creating auth user: ${authError.message}`);
        setProcessing(false);
        return;
      }

      if (!authData.user) {
        alert('Failed to create user');
        setProcessing(false);
        return;
      }

      // 2. Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: authData.user.id,
          email: request.email,
          full_name: request.full_name,
          role: role,
          phone: '',
          active: true
        }]);

      if (profileError) {
        alert(`Error creating profile: ${profileError.message}`);
        setProcessing(false);
        return;
      }

      // 3. Update access request
      const { error: updateError } = await supabase
        .from('access_requests')
        .update({
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          assigned_role: role
        })
        .eq('id', request.id);

      if (updateError) {
        alert(`Error updating request: ${updateError.message}`);
        setProcessing(false);
        return;
      }

      // Success!
      alert(`✅ Access approved! ${request.full_name} can now login as ${role}.`);
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
      const { error } = await supabase
        .from('access_requests')
        .update({
          status: 'denied',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          denial_reason: denialReason
        })
        .eq('id', request.id);

      if (error) throw error;

      alert('❌ Access request denied');
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

          {user?.role === 'admin' && (
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg">
              👑 ADMIN
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
                className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg hover:shadow-xl transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
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

                  {request.status === 'pending' && (
                    <div className="flex gap-3 ml-4">
                      <button
                        onClick={() => {
                          setSelectedRequest(request);
                          setSelectedRole('operator');
                          setShowApprovalModal(true);
                        }}
                        className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl"
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
                    </div>
                  )}
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
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSelectedRole('operator')}
                    className={`p-4 rounded-xl border-2 font-semibold transition-all ${
                      selectedRole === 'operator'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    👷 Operator
                  </button>
                  <button
                    onClick={() => setSelectedRole('admin')}
                    className={`p-4 rounded-xl border-2 font-semibold transition-all ${
                      selectedRole === 'admin'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    👑 Admin
                  </button>
                </div>
              </div>

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
                  className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-all disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Deny'}
                </button>
                <button
                  onClick={() => handleApprove(selectedRequest, selectedRole)}
                  disabled={processing}
                  className="flex-1 px-6 py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 transition-all disabled:opacity-50"
                >
                  {processing ? 'Processing...' : `Approve as ${selectedRole}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
