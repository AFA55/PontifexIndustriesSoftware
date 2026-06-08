'use client';

export const dynamic = 'force-dynamic';

/**
 * Invite Users — admins onboard their crew.
 *
 * Form: email, full name, role (filtered to roles below the inviter's rank),
 * optional phone. Lists pending / accepted / expired invitations with a
 * resend action. Gated to admin / super_admin / operations_manager.
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

  const invitableRoles = inviterRole ? getInvitableRoles(inviterRole) : [];

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    };
  }, []);

  const loadInvitations = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/admin/invite', { headers: await authHeaders() });
      const json = await res.json();
      if (json.success) setInvitations(json.data.invitations || []);
    } catch {
      /* non-fatal */
    } finally {
      setLoadingList(false);
    }
  }, [authHeaders]);

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
    void loadInvitations();
  }, [router, loadInvitations]);

  // Default the role select to the first invitable role once known.
  useEffect(() => {
    if (!role && invitableRoles.length > 0) setRole(invitableRoles[0].value);
  }, [invitableRoles, role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!email.trim() || !name.trim() || !role) {
      setFormError('Email, full name, and role are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/invite', {
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

  const handleResend = async (id: string) => {
    setResendingId(id);
    setFormError('');
    setFormSuccess('');
    try {
      const res = await fetch('/api/admin/invite', {
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

          <button
            type="submit"
            disabled={submitting}
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
      </div>
    </div>
  );
}
