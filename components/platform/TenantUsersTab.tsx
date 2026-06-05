'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus, Mail, RefreshCw, ShieldOff, CheckCircle2, X, Users as UsersIcon,
} from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';
import { getCurrentUser } from '@/lib/auth';
import { getJsonHeaders, getHeaders, ConfirmModal } from '@/components/platform/shared';

/** CLAUDE.md role hierarchy (priority order). */
const ROLES = [
  'operations_manager', 'admin', 'salesman', 'shop_manager',
  'inventory_manager', 'operator', 'apprentice',
] as const;

interface TenantUser {
  id: string;            // profiles.id (== auth user id)
  full_name: string | null;
  email: string;
  role: string;
  active: boolean;
  created_at?: string;
}

function roleLabel(role: string) {
  return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Cross-tenant user management (PLATFORM_CONSOLE_PLAN.md §2.2 / §3.2).
 * Calls the platform-namespaced routes that target this tenant explicitly:
 *   GET/POST  /api/admin/platform/tenants/[id]/users
 *   PATCH     /api/admin/platform/tenants/[id]/users/[userId]
 * Guard-rail errors (last-admin, self-demote) surface as toasts.
 */
export default function TenantUsersTab({ tenantId }: { tenantId: string }) {
  const { success, error: showError } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [confirm, setConfirm] = useState<null | { user: TenantUser; action: 'deactivate' | 'reactivate' }>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const selfId = getCurrentUser()?.id || null;

  const base = `/api/admin/platform/tenants/${tenantId}/users`;

  const fetchUsers = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const res = await fetch(base, { headers });
      const json = await res.json();
      if (json.success) setUsers(json.data || []);
      else showError('Failed to load users', json.error);
    } catch (err: any) {
      showError('Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [base, showError]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const changeRole = async (user: TenantUser, role: string) => {
    if (role === user.role) return;
    setBusyId(user.id);
    try {
      const headers = await getJsonHeaders();
      const res = await fetch(`${base}/${user.id}`, {
        method: 'PATCH', headers, body: JSON.stringify({ role }),
      });
      const json = await res.json();
      if (json.success) {
        success('Role updated', `${user.email} is now ${roleLabel(role)}`);
        fetchUsers();
      } else {
        // Surface guard-rail errors (last-admin / self-demote) verbatim
        showError('Could not change role', json.error);
      }
    } catch (err: any) {
      showError('Error', err.message);
    } finally {
      setBusyId(null);
    }
  };

  const setActive = async (user: TenantUser, active: boolean) => {
    setBusyId(user.id);
    try {
      const headers = await getJsonHeaders();
      const res = await fetch(`${base}/${user.id}`, {
        method: 'PATCH', headers, body: JSON.stringify({ active }),
      });
      const json = await res.json();
      if (json.success) {
        success(active ? 'User reactivated' : 'User deactivated', user.email);
        fetchUsers();
      } else {
        showError(active ? 'Could not reactivate' : 'Could not deactivate', json.error);
      }
    } catch (err: any) {
      showError('Error', err.message);
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-7 h-7 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          {users.length} user{users.length === 1 ? '' : 's'} in this tenant
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2.5 min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Add User
        </button>
      </div>

      {users.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-10 text-center">
          <UsersIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-slate-400">No users yet. Invite the first admin.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-800">
          {users.map(user => {
            const isSelf = selfId === user.id;
            const busy = busyId === user.id;
            return (
              <div key={user.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${
                    user.active ? 'bg-gradient-to-br from-violet-500 to-purple-600' : 'bg-gray-300 dark:bg-slate-700'
                  }`}>
                    {(user.full_name || user.email)[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate flex items-center gap-1.5">
                      {user.full_name || '—'}
                      {!user.active && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-gray-100 dark:bg-slate-800 text-gray-500">INACTIVE</span>
                      )}
                      {isSelf && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-700">YOU</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Change role */}
                  <select
                    value={user.role}
                    disabled={busy || isSelf}
                    onChange={e => changeRole(user, e.target.value)}
                    title={isSelf ? 'You cannot change your own role here' : 'Change role'}
                    className="px-2.5 py-2 min-h-[44px] bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-medium text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
                  >
                    {/* keep the user's current role visible even if it's super_admin or unknown */}
                    {!ROLES.includes(user.role as any) && (
                      <option value={user.role}>{roleLabel(user.role)}</option>
                    )}
                    {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>

                  {/* (De)activate */}
                  {user.active ? (
                    <button
                      onClick={() => setConfirm({ user, action: 'deactivate' })}
                      disabled={busy || isSelf}
                      title={isSelf ? 'You cannot deactivate yourself' : 'Deactivate'}
                      className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                    >
                      <ShieldOff className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setActive(user, true)}
                      disabled={busy}
                      title="Reactivate"
                      className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 disabled:opacity-40 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddUserModal
          base={base}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); fetchUsers(); }}
        />
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.action === 'deactivate' ? 'Deactivate user?' : 'Reactivate user?'}
          message={
            <>
              {confirm.action === 'deactivate'
                ? <>This will block <strong>{confirm.user.email}</strong> from signing in. It is reversible.</>
                : <>This will restore sign-in access for <strong>{confirm.user.email}</strong>.</>}
            </>
          }
          confirmLabel={confirm.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
          destructive={confirm.action === 'deactivate'}
          busy={busyId === confirm.user.id}
          onConfirm={() => setActive(confirm.user, confirm.action === 'reactivate')}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function AddUserModal({ base, onClose, onAdded }: {
  base: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { success, error: showError } = useNotifications();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>('operator');
  const [invite, setInvite] = useState(true);
  const [tempPassword, setTempPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const headers = await getJsonHeaders();
      const body: Record<string, unknown> = { email, name, role };
      if (!invite && tempPassword) body.tempPassword = tempPassword;
      const res = await fetch(base, { method: 'POST', headers, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) {
        success('User added', invite ? `Invitation sent to ${email}` : `${email} created`);
        onAdded();
      } else {
        showError('Could not add user', json.error);
      }
    } catch (err: any) {
      showError('Error', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 dark:bg-violet-950/40 rounded-xl flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-violet-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add User to Tenant</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Email *</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="user@company.com"
              className="w-full px-3 py-2.5 min-h-[44px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Full Name</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full px-3 py-2.5 min-h-[44px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Role</label>
            <select
              value={role} onChange={e => setRole(e.target.value)}
              className="w-full px-3 py-2.5 min-h-[44px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            >
              {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={invite} onChange={e => setInvite(e.target.checked)} className="w-4 h-4 accent-violet-600" />
            <Mail className="w-4 h-4 text-gray-400" />
            Send an email invitation (user sets their own password)
          </label>

          {!invite && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Temporary Password</label>
              <input
                type="text" value={tempPassword} onChange={e => setTempPassword(e.target.value)}
                placeholder="Set an initial password"
                className="w-full px-3 py-2.5 min-h-[44px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-slate-800">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 min-h-[44px] bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-xl text-sm font-semibold transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 px-4 py-2.5 min-h-[44px] bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
              {busy ? 'Adding…' : invite ? 'Send Invite' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
