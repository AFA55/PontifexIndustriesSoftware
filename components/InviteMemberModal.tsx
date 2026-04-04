'use client';
import { useState } from 'react';
import { X, Send, Loader2, CheckCircle, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ─── Role Definitions ───────────────────────────────────────────────────────

const ROLES: { value: string; label: string; description: string; isFieldRole?: boolean }[] = [
  { value: 'operator',           label: 'Operator',        description: 'Field operator with mobile dashboard', isFieldRole: true },
  { value: 'apprentice',         label: 'Team Member',     description: 'Helper with simplified field dashboard', isFieldRole: true },
  { value: 'salesman',           label: 'Project Manager', description: 'Schedule requests, job views, customer directory' },
  { value: 'supervisor',         label: 'Supervisor',      description: 'Schedule views, notes, forms, assigned jobs' },
  { value: 'inventory_manager',  label: 'Office Admin',    description: 'View-only schedule, timecards, invoicing' },
  { value: 'admin',              label: 'Admin',           description: 'Customizable admin dashboard access' },
  { value: 'operations_manager', label: 'Management',      description: 'Full system access' },
];

// ─── Preset Definitions ──────────────────────────────────────────────────────

interface Preset {
  key: string;
  label: string;
  description: string;
  flags: Record<string, boolean>;
}

const PRESETS_BY_ROLE: Record<string, Preset[]> = {
  salesman: [
    {
      key: 'project_manager',
      label: 'Project Manager',
      description: 'Schedule requests, job views, customer directory',
      flags: {
        can_view_schedule_board: true,
        can_view_active_jobs: true,
        can_view_customers: true,
        can_view_completed_jobs: true,
        can_request_schedule_changes: true,
        can_submit_schedule_forms: true,
      },
    },
  ],
  supervisor: [
    {
      key: 'supervisor',
      label: 'Supervisor',
      description: 'Schedule, active jobs, timecards, notes, forms',
      flags: {
        can_view_schedule_board: true,
        can_view_active_jobs: true,
        can_view_customers: true,
        can_view_completed_jobs: true,
        can_view_timecards: true,
        can_submit_schedule_forms: true,
        can_leave_notes: true,
      },
    },
  ],
  inventory_manager: [
    {
      key: 'office_admin',
      label: 'Office Admin',
      description: 'View schedule, timecards, customers, invoicing',
      flags: {
        can_view_schedule_board: true,
        can_view_timecards: true,
        can_view_customers: true,
        can_view_completed_jobs: true,
        can_view_invoicing: true,
      },
    },
  ],
  admin: [
    {
      key: 'operations_admin',
      label: 'Operations Admin',
      description: 'Schedule, jobs, timecards, team, facilities',
      flags: {
        can_view_schedule_board: true,
        can_submit_schedule_forms: true,
        can_view_active_jobs: true,
        can_view_all_jobs: true,
        can_view_timecards: true,
        can_view_customers: true,
        can_manage_team: true,
        can_view_facilities: true,
      },
    },
    {
      key: 'finance_admin',
      label: 'Finance Admin',
      description: 'Jobs, timecards, invoicing, analytics, customers',
      flags: {
        can_view_active_jobs: true,
        can_view_all_jobs: true,
        can_view_timecards: true,
        can_view_invoicing: true,
        can_view_analytics: true,
        can_view_customers: true,
      },
    },
    {
      key: 'field_admin',
      label: 'Field Admin',
      description: 'Schedule forms, schedule board, active jobs, change requests',
      flags: {
        can_submit_schedule_forms: true,
        can_view_schedule_board: true,
        can_view_active_jobs: true,
        can_request_schedule_changes: true,
      },
    },
  ],
};

const PRESET_ROLES = new Set(Object.keys(PRESETS_BY_ROLE));

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function InviteMemberModal({ onClose, onSuccess }: Props) {
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [phone, setPhone]           = useState('');
  const [dob, setDob]               = useState('');
  const [role, setRole]             = useState('admin');
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [sending, setSending]       = useState(false);
  const [error, setError]           = useState('');
  const [sent, setSent]             = useState(false);

  const currentRole = ROLES.find(r => r.value === role);
  const isFieldRole = currentRole?.isFieldRole ?? false;
  const presets     = PRESETS_BY_ROLE[role] ?? [];
  const showPresets = PRESET_ROLES.has(role) && presets.length > 0;

  const resolvedFlags = (): Record<string, boolean> => {
    if (!showPresets || !selectedPreset) return {};
    return presets.find(p => p.key === selectedPreset)?.flags ?? {};
  };

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    setSelectedPreset('');
  };

  const handleSend = async () => {
    if (!name.trim() || !email.trim() || !role) {
      setError('Full name, email, and role are required.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      };
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name:          name.trim(),
          email:         email.trim(),
          phone_number:  phone.trim() || null,
          date_of_birth: dob || null,
          role,
          adminType:     selectedPreset || null,
          initialFlags:  resolvedFlags(),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to send invitation');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-[#13131a] rounded-2xl border border-white/[0.08] w-full max-w-md p-8 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-violet-500/10 border border-violet-500/30 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-violet-400" />
          </div>
          <h2 className="text-xl font-semibold text-white">Invitation Sent</h2>
          <p className="text-sm text-white/50">
            An invite email has been sent to <span className="text-white/80 font-medium">{email}</span>.
            They will receive a link to complete their account setup.
          </p>
          <button
            onClick={onSuccess}
            className="mt-2 w-full bg-violet-600 hover:bg-violet-700 text-white rounded-xl py-3 font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#13131a] rounded-2xl border border-white/[0.08] w-full max-w-md max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
          <h2 className="text-lg font-semibold text-white">Invite Team Member</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Full Name */}
          <div>
            <label className="text-sm text-white/50 mb-1.5 block">Full Name <span className="text-violet-400">*</span></label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-violet-500/60 transition-colors"
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-sm text-white/50 mb-1.5 block">Email Address <span className="text-violet-400">*</span></label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jane@company.com"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-violet-500/60 transition-colors"
            />
          </div>

          {/* Phone + DOB row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-white/50 mb-1.5 block">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(555) 000-0000"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-violet-500/60 transition-colors"
              />
            </div>
            <div>
              <label className="text-sm text-white/50 mb-1.5 block">Date of Birth</label>
              <input
                type="date"
                value={dob}
                onChange={e => setDob(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white/70 focus:outline-none focus:border-violet-500/60 transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="text-sm text-white/50 mb-2 block">Role <span className="text-violet-400">*</span></label>
            <div className="space-y-2">
              {ROLES.map(r => (
                <button
                  key={r.value}
                  onClick={() => handleRoleChange(r.value)}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    role === r.value
                      ? 'border-violet-500/60 bg-violet-500/10'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    role === r.value ? 'border-violet-400' : 'border-white/20'
                  }`}>
                    {role === r.value && <div className="w-2 h-2 rounded-full bg-violet-400" />}
                  </div>
                  <div>
                    <p className={`text-sm font-medium leading-none mb-0.5 ${role === r.value ? 'text-white' : 'text-white/70'}`}>
                      {r.label}
                    </p>
                    <p className="text-xs text-white/35">{r.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Field role notice */}
          {isFieldRole && (
            <div className="flex gap-2.5 bg-blue-500/[0.08] border border-blue-500/20 rounded-xl p-3.5">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-300/80 leading-relaxed">
                Operators and Team Members have a separate mobile-first dashboard designed for field work.
                They will <strong className="text-blue-300">not</strong> access the admin panel.
              </p>
            </div>
          )}

          {/* Quick Presets */}
          {showPresets && (
            <div>
              <label className="text-sm text-white/50 mb-2 block">
                Quick Preset
                <span className="text-white/25 ml-1.5 font-normal">(optional — sets default permissions)</span>
              </label>
              <div className="space-y-2">
                {/* "Custom / no preset" option */}
                <button
                  onClick={() => setSelectedPreset('')}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    selectedPreset === ''
                      ? 'border-violet-500/60 bg-violet-500/10'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    selectedPreset === '' ? 'border-violet-400' : 'border-white/20'
                  }`}>
                    {selectedPreset === '' && <div className="w-2 h-2 rounded-full bg-violet-400" />}
                  </div>
                  <div>
                    <p className={`text-sm font-medium leading-none mb-0.5 ${selectedPreset === '' ? 'text-white' : 'text-white/70'}`}>
                      Custom
                    </p>
                    <p className="text-xs text-white/35">No preset — configure permissions manually after invite</p>
                  </div>
                </button>

                {presets.map(preset => (
                  <button
                    key={preset.key}
                    onClick={() => setSelectedPreset(preset.key)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      selectedPreset === preset.key
                        ? 'border-violet-500/60 bg-violet-500/10'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                    }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      selectedPreset === preset.key ? 'border-violet-400' : 'border-white/20'
                    }`}>
                      {selectedPreset === preset.key && <div className="w-2 h-2 rounded-full bg-violet-400" />}
                    </div>
                    <div>
                      <p className={`text-sm font-medium leading-none mb-0.5 ${selectedPreset === preset.key ? 'text-white' : 'text-white/70'}`}>
                        {preset.label}
                      </p>
                      <p className="text-xs text-white/35">{preset.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          {/* Email info */}
          <div className="flex gap-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5">
            <Info className="w-4 h-4 text-white/30 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-white/40 leading-relaxed">
              An invitation email will be sent to{' '}
              <span className="text-white/60">{email || 'the provided email address'}</span> with a link
              to complete account setup and set their password.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="flex-1 bg-white/[0.04] hover:bg-white/[0.07] text-white/60 hover:text-white rounded-xl py-3 font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-3 font-semibold transition-colors flex items-center justify-center gap-2"
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
