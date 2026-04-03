'use client';
import { useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const ADMIN_TYPE_PRESETS: Record<string, Record<string, boolean>> = {
  sales_admin: {
    can_create_schedule_forms: true, can_view_schedule_board: true, can_view_active_jobs: true,
    can_view_customers: true, can_view_completed_jobs: true, can_request_schedule_changes: true,
  },
  ops_admin: {
    can_create_schedule_forms: true, can_view_schedule_board: true, can_edit_schedule_board: true,
    can_view_active_jobs: true, can_view_all_jobs: true, can_view_timecards: true,
    can_view_customers: true, can_manage_team: true, can_view_facilities: true,
  },
  finance_admin: {
    can_view_active_jobs: true, can_view_all_jobs: true, can_view_timecards: true,
    can_view_invoicing: true, can_view_analytics: true, can_view_customers: true,
  },
  field_admin: {
    can_create_schedule_forms: true, can_view_schedule_board: true,
    can_view_active_jobs: true, can_request_schedule_changes: true,
  },
};

const ADMIN_ROLES = ['admin', 'salesman', 'operations_manager', 'shop_manager'];

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function InviteMemberModal({ onClose, onSuccess }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('admin');
  const [adminType, setAdminType] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!name || !email || !role) { setError('Name, email, and role are required'); return; }
    setSending(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      };
      const initialFlags = adminType ? ADMIN_TYPE_PRESETS[adminType] || {} : {};
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, email, role, adminType: adminType || null, initialFlags }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to send invitation');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Invite Team Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm text-gray-400 mb-1 block">Full Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="John Smith"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-1 block">Email Address *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="john@company.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-1 block">Role *</label>
            <select
              value={role}
              onChange={e => { setRole(e.target.value); setAdminType(''); }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="admin">Admin</option>
              <option value="salesman">Salesman</option>
              <option value="operations_manager">Operations Manager</option>
              <option value="shop_manager">Shop Manager</option>
              <option value="operator">Operator</option>
              <option value="apprentice">Apprentice / Helper</option>
            </select>
          </div>

          {/* Admin type — only for admin-level roles */}
          {ADMIN_ROLES.includes(role) && (
            <div>
              <label className="text-sm text-gray-400 mb-2 block">
                Admin Type <span className="text-gray-500">(optional — sets default permissions)</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: '', label: '⬜ Custom' },
                  { key: 'sales_admin', label: '💼 Sales' },
                  { key: 'ops_admin', label: '⚙️ Operations' },
                  { key: 'finance_admin', label: '💰 Finance' },
                  { key: 'field_admin', label: '🏗️ Field' },
                ].map(t => (
                  <button
                    key={t.key}
                    onClick={() => setAdminType(t.key)}
                    className={`p-2 rounded-lg border text-sm text-left transition-all ${
                      adminType === t.key
                        ? 'border-purple-500 bg-purple-500/10 text-white'
                        : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
            <p className="text-blue-300 text-sm">
              📧 An invitation email will be sent to{' '}
              <strong>{email || 'the provided email'}</strong> with a link to complete account
              setup and set their password.
            </p>
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t border-gray-800">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl py-3 font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl py-3 font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
              : <><Send className="w-4 h-4" /> Send Invite</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
