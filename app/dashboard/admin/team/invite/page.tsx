'use client';

export const dynamic = 'force-dynamic';

/**
 * Invite Users — admins onboard their crew.
 *
 * Two tabs:
 *  - Send Invites: email, full name, role (filtered to roles below the
 *    inviter's rank), optional phone. Lists pending / accepted / expired
 *    invitations with a resend action.
 *  - Access Requests: pending requests from the public "Request Login" form.
 *    Approve (pick a role, rank-guarded) → flows the requester into the SAME
 *    invite/setup-account pipeline. Deny with an optional reason.
 *
 * Gated to admin / super_admin / operations_manager.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getInvitableRoles, getRoleLabel } from '@/lib/rbac';
import {
  ArrowLeft, UserPlus, Mail, Loader2, CheckCircle2, Clock,
  AlertTriangle, RefreshCw, Send, Phone, User as UserIcon, Shield,
  Inbox, Check, X, Building2,
} from 'lucide-react';

const ALLOWED_ROLES = ['admin', 'super_admin', 'operations_manager'];

interface Invitation {
  id: string;
  email: string;
  name: string | null;
  role: string;
  phone_number: string | null;
  status: 'pending' | 'accepted' | 'expired';
  invited_at: string;
  accepted_at: string | null;
  expires_at: string | null;
}

interface AccessRequest {
  id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  position: string | null;
  status: 'pending' | 'approved' | 'denied';
  assigned_role: string | null;
  denial_reason: string | null;
  created_at: string;
}

interface TenantOption {
  id: string;
  name: string;
  company_code: string | null;
}

type TabKey = 'invite' | 'requests';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InviteUsersPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [inviterRole, setInviterRole] = useState('');

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // ── Access Requests tab state ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('invite');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requestRoles, setRequestRoles] = useState<Record<string, string>>({});
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [denyTargetId, setDenyTargetId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [requestsError, setRequestsError] = useState('');
  const [requestsSuccess, setRequestsSuccess] = useState('');

  // ── Super-admin tenant targeting ───────────────────────────────────────────
  // A super_admin (platform org) inviting from this page once landed a real
  // crew member in the WRONG tenant (the super_admin's own org + default role).
  // Super admins must now pick the target company EXPLICITLY — no default —
  // and every API call on this page is scoped with ?tenantId=.
  // Non-super-admins see no change (the API pins them to their own tenant).
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState('');

  const isSuperAdmin = inviterRole === 'super_admin';
  /** Query-string suffix scoping a request to the chosen tenant ('' for non-super-admins). */
  const tenantQS = isSuperAdmin && selectedTenantId
    ? `?tenantId=${encodeURIComponent(selectedTenantId)}`
    : '';
  /** True while a super_admin hasn't chosen a company yet — data loads + sends are held. */
  const tenantPending = isSuperAdmin && !selectedTenantId;

  const invitableRoles = inviterRole ? getInvitableRoles(inviterRole) : [];
  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const processedRequests = requests.filter((r) => r.status !== 'pending');

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    };
  }, []);

  const loadInvitations = useCallback(async () => {
    if (tenantPending) {
      // Super admin hasn't picked a company yet — nothing to show.
      setInvitations([]);
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    try {
      const res = await fetch(`/api/admin/invite${tenantQS}`, { headers: await authHeaders() });
      const json = await res.json();
      if (json.success) setInvitations(json.data.invitations || []);
    } catch {
      /* non-fatal */
    } finally {
      setLoadingList(false);
    }
  }, [authHeaders, tenantQS, tenantPending]);

  const loadRequests = useCallback(async () => {
    if (tenantPending) {
      setRequests([]);
      setLoadingRequests(false);
      return;
    }
    setLoadingRequests(true);
    try {
      const res = await fetch(`/api/admin/access-requests${tenantQS}`, { headers: await authHeaders() });
      const json = await res.json();
      if (json.success) {
        setRequests(json.data.requests || []);
      } else {
        setRequestsError(json.error || 'Failed to load access requests');
      }
    } catch {
      setRequestsError('Failed to load access requests');
    } finally {
      setLoadingRequests(false);
    }
  }, [authHeaders, tenantQS, tenantPending]);

  // ── Auth gate ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
      return;
    }
    if (!ALLOWED_ROLES.includes(user.role)) {
      router.push('/dashboard');
      return;
    }
    setInviterRole(user.role);
    setAuthChecked(true);
    // Deep link: /dashboard/admin/team/invite?tab=requests
    if (typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('tab') === 'requests') {
      setActiveTab('requests');
    }
  }, [router]);

  // Load lists once authed — and reload whenever the super_admin switches the
  // target company (tenantQS changes → callbacks change → effect re-runs).
  useEffect(() => {
    if (!authChecked) return;
    void loadInvitations();
    void loadRequests();
  }, [authChecked, loadInvitations, loadRequests]);

  // super_admin only: fetch the tenant list for the Company picker.
  useEffect(() => {
    if (!authChecked || inviterRole !== 'super_admin') return;
    let cancelled = false;
    (async () => {
      setLoadingTenants(true);
      try {
        const res = await fetch('/api/admin/tenants', { headers: await authHeaders() });
        const json = await res.json();
        if (!cancelled && json.success) {
          setTenants(
            (json.data || []).map((t: { id: string; name: string; company_code: string | null }) => ({
              id: t.id,
              name: t.name,
              company_code: t.company_code ?? null,
            }))
          );
        }
      } catch {
        /* non-fatal — picker shows empty, Send stays disabled */
      } finally {
        if (!cancelled) setLoadingTenants(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authChecked, inviterRole, authHeaders]);

  // Default the role select to the first invitable role once known.
  useEffect(() => {
    if (!role && invitableRoles.length > 0) setRole(invitableRoles[0].value);
  }, [invitableRoles, role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (tenantPending) {
      setFormError('Select which company this person is being invited to first.');
      return;
    }
    if (!email.trim() || !name.trim() || !role) {
      setFormError('Email, full name, and role are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/invite${tenantQS}`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          role,
          phone_number: phone.trim() || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to send invitation');

      setFormSuccess(`Invitation sent to ${email.trim()}.`);
      setEmail('');
      setName('');
      setPhone('');
      setRole(invitableRoles[0]?.value || '');
      await loadInvitations();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Access request actions ─────────────────────────────────────────────────
  const roleForRequest = (id: string): string =>
    requestRoles[id] ||
    (invitableRoles.some((r) => r.value === 'operator') ? 'operator' : invitableRoles[0]?.value || '');

  const handleApproveRequest = async (req: AccessRequest) => {
    const role = roleForRequest(req.id);
    if (!role) {
      setRequestsError('Pick a role before approving.');
      return;
    }
    setActioningId(req.id);
    setRequestsError('');
    setRequestsSuccess('');
    try {
      const res = await fetch(`/api/admin/access-requests/${req.id}${tenantQS}`, {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ action: 'approve', role }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to approve request');
      setRequestsSuccess(
        `${req.full_name} approved as ${getRoleLabel(role)} — setup link emailed to ${req.email}.`
      );
      await Promise.all([loadRequests(), loadInvitations()]);
    } catch (err) {
      setRequestsError(err instanceof Error ? err.message : 'Failed to approve request');
    } finally {
      setActioningId(null);
    }
  };

  const handleDenyRequest = async (req: AccessRequest) => {
    setActioningId(req.id);
    setRequestsError('');
    setRequestsSuccess('');
    try {
      const res = await fetch(`/api/admin/access-requests/${req.id}${tenantQS}`, {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ action: 'deny', reason: denyReason.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to deny request');
      setRequestsSuccess(`Request from ${req.full_name} denied.`);
      setDenyTargetId(null);
      setDenyReason('');
      await loadRequests();
    } catch (err) {
      setRequestsError(err instanceof Error ? err.message : 'Failed to deny request');
    } finally {
      setActioningId(null);
    }
  };

  const handleResend = async (id: string) => {
    setResendingId(id);
    setFormError('');
    setFormSuccess('');
    try {
      const res = await fetch(`/api/admin/invite${tenantQS}`, {
        method: 'PUT',
        headers: await authHeaders(),
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to resend');
      setFormSuccess('Invitation resent.');
      await loadInvitations();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to resend invitation');
    } finally {
      setResendingId(null);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
        <Loader2 className="w-8 h-8 text-violet-500 dark:text-violet-400 animate-spin" />
      </div>
    );
  }

  const statusChip = (status: Invitation['status']) => {
    if (status === 'accepted')
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" /> Accepted
        </span>
      );
    if (status === 'expired')
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30">
          <AlertTriangle className="w-3 h-3" /> Expired
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
        <Clock className="w-3 h-3" /> Pending
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900 dark:from-[#0b0618] dark:to-[#0e0720] dark:text-white">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:text-white/60 dark:hover:text-white text-sm mb-5 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-violet-50 border border-violet-200 dark:bg-violet-500/15 dark:border-violet-500/30 flex items-center justify-center flex-shrink-0">
            <UserPlus className="w-5 h-5 text-violet-600 dark:text-violet-300" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Invite Team Members</h1>
            <p className="text-slate-500 dark:text-white/60 text-sm">Send a setup link so your crew can onboard themselves.</p>
          </div>
        </div>

        {/* Super-admin company picker — forces an EXPLICIT tenant choice.
            A real onboarding once landed in the wrong tenant because the
            super_admin's own org was silently used as the default. */}
        {isSuperAdmin && (
          <div className="bg-white/90 ring-1 ring-violet-200 shadow-sm rounded-2xl p-4 sm:p-5 mb-6 dark:bg-white/[0.04] dark:ring-violet-500/30">
            <label htmlFor="invite-tenant" className="text-sm text-slate-500 dark:text-white/60 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Company
              <span className="text-violet-600 dark:text-violet-300 font-medium">(required)</span>
            </label>
            <select
              id="invite-tenant"
              value={selectedTenantId}
              onChange={(e) => {
                setSelectedTenantId(e.target.value);
                setFormError('');
                setRequestsError('');
                setFormSuccess('');
                setRequestsSuccess('');
              }}
              className="w-full rounded-xl px-4 py-3 text-sm transition-colors min-h-[44px]
                bg-white border border-slate-200 text-slate-900
                focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
                dark:bg-white/5 dark:border-white/10 dark:text-white
                dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20"
            >
              <option value="" disabled>
                {loadingTenants ? 'Loading companies…' : 'Select a company…'}
              </option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.company_code ? ` (${t.company_code})` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 dark:text-white/40 mt-1.5">
              You&apos;re a platform super admin — invitations, the invitation list, and access
              requests below all target the company you pick here.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6" role="tablist" aria-label="Invite and access requests">
          <button
            role="tab"
            aria-selected={activeTab === 'invite'}
            onClick={() => setActiveTab('invite')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-[44px] ${
              activeTab === 'invite'
                ? 'bg-violet-600 text-white'
                : 'bg-white/90 ring-1 ring-slate-200 text-slate-600 hover:text-slate-900 dark:bg-white/[0.04] dark:ring-white/10 dark:text-white/60 dark:hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" /> Send Invites
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'requests'}
            onClick={() => setActiveTab('requests')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-[44px] ${
              activeTab === 'requests'
                ? 'bg-violet-600 text-white'
                : 'bg-white/90 ring-1 ring-slate-200 text-slate-600 hover:text-slate-900 dark:bg-white/[0.04] dark:ring-white/10 dark:text-white/60 dark:hover:text-white'
            }`}
          >
            <Inbox className="w-4 h-4" /> Access Requests
            {pendingRequests.length > 0 && (
              <span
                className={`min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full text-xs font-bold ${
                  activeTab === 'requests' ? 'bg-white/25 text-white' : 'bg-amber-500 text-white'
                }`}
              >
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'requests' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Pending Requests
              </h2>
              <button
                onClick={() => loadRequests()}
                className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:text-white/60 dark:hover:text-white text-sm min-h-[44px] px-2"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            {requestsError && (
              <p className="text-rose-700 dark:text-rose-300 text-sm bg-rose-50 border border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20 rounded-lg px-3 py-2 mb-3">
                {requestsError}
              </p>
            )}
            {requestsSuccess && (
              <p className="text-emerald-700 dark:text-emerald-300 text-sm bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 rounded-lg px-3 py-2 mb-3">
                {requestsSuccess}
              </p>
            )}

            {loadingRequests ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-violet-500 dark:text-violet-400 animate-spin" />
              </div>
            ) : tenantPending ? (
              <div className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-8 text-center text-slate-500 dark:bg-white/[0.04] dark:ring-white/10 dark:text-white/60">
                Select a company above to see its access requests.
              </div>
            ) : pendingRequests.length === 0 ? (
              <div className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-8 text-center text-slate-500 dark:bg-white/[0.04] dark:ring-white/10 dark:text-white/60">
                No pending access requests. People can request access from the login page.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-4 dark:bg-white/[0.04] dark:ring-white/10"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {req.full_name}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-white/60 truncate">{req.email}</div>
                        <div className="text-xs text-slate-400 dark:text-white/40 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          {req.phone_number && <span>{req.phone_number}</span>}
                          {req.position && req.position !== 'Not specified' && <span>{req.position}</span>}
                          <span>Requested {fmtDate(req.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-shrink-0">
                        <select
                          value={roleForRequest(req.id)}
                          onChange={(e) =>
                            setRequestRoles((prev) => ({ ...prev, [req.id]: e.target.value }))
                          }
                          aria-label={`Role for ${req.full_name}`}
                          className="rounded-xl px-3 py-2.5 text-sm transition-colors min-h-[44px]
                            bg-white border border-slate-200 text-slate-900
                            focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
                            dark:bg-white/5 dark:border-white/10 dark:text-white
                            dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20"
                        >
                          {invitableRoles.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleApproveRequest(req)}
                          disabled={actioningId === req.id}
                          className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors min-h-[44px]"
                        >
                          {actioningId === req.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          Approve &amp; Invite
                        </button>
                        <button
                          onClick={() => {
                            setDenyTargetId(denyTargetId === req.id ? null : req.id);
                            setDenyReason('');
                          }}
                          disabled={actioningId === req.id}
                          className="inline-flex items-center justify-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 disabled:opacity-60 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors min-h-[44px] dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30"
                        >
                          <X className="w-4 h-4" /> Deny
                        </button>
                      </div>
                    </div>

                    {denyTargetId === req.id && (
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10 flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={denyReason}
                          onChange={(e) => setDenyReason(e.target.value)}
                          placeholder="Reason (optional)"
                          maxLength={500}
                          className="flex-1 rounded-xl px-4 py-2.5 text-sm transition-colors min-h-[44px]
                            bg-white border border-slate-200 text-slate-900 placeholder-slate-400
                            focus:border-rose-400 focus:ring-2 focus:ring-rose-100 focus:outline-none
                            dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/40
                            dark:focus:border-rose-400/60 dark:focus:ring-rose-500/20"
                        />
                        <button
                          onClick={() => handleDenyRequest(req)}
                          disabled={actioningId === req.id}
                          className="inline-flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors min-h-[44px]"
                        >
                          {actioningId === req.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                          Confirm Deny
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Processed history */}
            {!loadingRequests && processedRequests.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wide mb-3">
                  Processed
                </h3>
                <div className="space-y-2">
                  {processedRequests.map((req) => (
                    <div
                      key={req.id}
                      className="bg-white/70 ring-1 ring-slate-100 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2 dark:bg-white/[0.02] dark:ring-white/5"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-slate-700 dark:text-white/80">{req.full_name}</span>
                        <span className="text-xs text-slate-400 dark:text-white/40 ml-2">{req.email}</span>
                      </div>
                      {req.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          Approved{req.assigned_role ? ` · ${getRoleLabel(req.assigned_role)}` : ''}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30"
                          title={req.denial_reason || undefined}
                        >
                          <X className="w-3 h-3" /> Denied
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'invite' && (
        <>
        {/* Invite form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-5 sm:p-6 mb-8 space-y-4 dark:bg-white/[0.04] dark:ring-white/10"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-500 dark:text-white/60 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="crew.member@company.com"
                autoComplete="off"
                className="w-full rounded-xl px-4 py-3 text-sm transition-colors min-h-[44px]
                  bg-white border border-slate-200 text-slate-900 placeholder-slate-400
                  focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
                  dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/40
                  dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20"
              />
            </div>
            <div>
              <label className="text-sm text-slate-500 dark:text-white/60 mb-1.5 flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5" /> Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jordan Smith"
                className="w-full rounded-xl px-4 py-3 text-sm transition-colors min-h-[44px]
                  bg-white border border-slate-200 text-slate-900 placeholder-slate-400
                  focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
                  dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/40
                  dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20"
              />
            </div>
            <div>
              <label className="text-sm text-slate-500 dark:text-white/60 mb-1.5 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm transition-colors min-h-[44px]
                  bg-white border border-slate-200 text-slate-900
                  focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
                  dark:bg-white/5 dark:border-white/10 dark:text-white
                  dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20"
              >
                {invitableRoles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {role && (
                <p className="text-xs text-slate-400 dark:text-white/40 mt-1.5">
                  {invitableRoles.find((r) => r.value === role)?.description}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm text-slate-500 dark:text-white/60 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Phone <span className="text-slate-400 dark:text-white/30">(optional)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                autoComplete="off"
                className="w-full rounded-xl px-4 py-3 text-sm transition-colors min-h-[44px]
                  bg-white border border-slate-200 text-slate-900 placeholder-slate-400
                  focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
                  dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/40
                  dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20"
              />
            </div>
          </div>

          {formError && (
            <p className="text-rose-700 dark:text-rose-300 text-sm bg-rose-50 border border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}
          {formSuccess && (
            <p className="text-emerald-700 dark:text-emerald-300 text-sm bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 rounded-lg px-3 py-2">
              {formSuccess}
            </p>
          )}

          {tenantPending && (
            <p className="text-amber-700 dark:text-amber-300 text-sm bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 rounded-lg px-3 py-2">
              Select a company above before sending — this controls which team the person joins.
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || tenantPending}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 font-semibold transition-colors min-h-[44px]"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Sending invitation…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Send Invitation
              </>
            )}
          </button>
        </form>

        {/* Invitations list */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Invitations</h2>
          <button
            onClick={() => loadInvitations()}
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:text-white/60 dark:hover:text-white text-sm min-h-[44px] px-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-violet-500 dark:text-violet-400 animate-spin" />
          </div>
        ) : tenantPending ? (
          <div className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-8 text-center text-slate-500 dark:bg-white/[0.04] dark:ring-white/10 dark:text-white/60">
            Select a company above to see its invitations.
          </div>
        ) : invitations.length === 0 ? (
          <div className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-8 text-center text-slate-500 dark:bg-white/[0.04] dark:ring-white/10 dark:text-white/60">
            No invitations yet. Send your first one above.
          </div>
        ) : (
          <div className="space-y-3">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 dark:bg-white/[0.04] dark:ring-white/10"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {inv.name || inv.email}
                    </span>
                    {statusChip(inv.status)}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-white/60 truncate">{inv.email}</div>
                  <div className="text-xs text-slate-400 dark:text-white/40 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>{getRoleLabel(inv.role)}</span>
                    <span>Invited {fmtDate(inv.invited_at)}</span>
                    {inv.status === 'accepted'
                      ? <span>Accepted {fmtDate(inv.accepted_at)}</span>
                      : <span>Expires {fmtDate(inv.expires_at)}</span>}
                  </div>
                </div>
                {inv.status !== 'accepted' && (
                  <button
                    onClick={() => handleResend(inv.id)}
                    disabled={resendingId === inv.id}
                    className="inline-flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] flex-shrink-0 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white/80"
                  >
                    {resendingId === inv.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Resend
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
