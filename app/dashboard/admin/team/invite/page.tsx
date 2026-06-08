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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  const statusChip = (status: Invitation['status']) => {
    if (status === 'accepted')
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" /> Accepted
        </span>
      );
    if (status === 'expired')
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
          <AlertTriangle className="w-3 h-3" /> Expired
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
        <Clock className="w-3 h-3" /> Pending
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-sm mb-5 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
            <UserPlus className="w-5 h-5 text-purple-300" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Invite Team Members</h1>
            <p className="text-gray-400 text-sm">Send a setup link so your crew can onboard themselves.</p>
          </div>
        </div>

        {/* Invite form */}
        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-6 mb-8 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="crew.member@company.com"
                autoComplete="off"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors min-h-[44px]"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5" /> Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jordan Smith"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors min-h-[44px]"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors min-h-[44px]"
              >
                {invitableRoles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {role && (
                <p className="text-xs text-gray-500 mt-1.5">
                  {invitableRoles.find((r) => r.value === role)?.description}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Phone <span className="text-gray-600">(optional)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                autoComplete="off"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors min-h-[44px]"
              />
            </div>
          </div>

          {formError && (
            <p className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}
          {formSuccess && (
            <p className="text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              {formSuccess}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3 font-semibold transition-colors min-h-[44px]"
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
          <h2 className="text-lg font-semibold">Invitations</h2>
          <button
            onClick={() => loadInvitations()}
            className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-sm min-h-[44px] px-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
          </div>
        ) : invitations.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-500">
            No invitations yet. Send your first one above.
          </div>
        ) : (
          <div className="space-y-3">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white truncate">
                      {inv.name || inv.email}
                    </span>
                    {statusChip(inv.status)}
                  </div>
                  <div className="text-sm text-gray-400 truncate">{inv.email}</div>
                  <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
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
                    className="inline-flex items-center justify-center gap-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-60 text-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] flex-shrink-0"
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
