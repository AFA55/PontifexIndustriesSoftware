'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Users, UserPlus, Search, Shield, Crown,
  Star, Briefcase, User, Settings, X,
  AlertTriangle, CheckCircle2, Mail, Phone, Calendar,
  Loader2, ChevronRight, Activity, Clock, UserCheck, Pencil,
  Wrench, Save, CheckCircle, Award, Truck,
  Plus, Trash2, IdCard,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import FeatureFlagsPanel, { type UserFeatureFlags } from '@/components/FeatureFlagsPanel';
import InviteMemberModal from '@/components/InviteMemberModal';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
  phone_number?: string | null;
  phone?: string | null;
  profile_picture_url?: string | null;
  created_at?: string;
  date_of_birth?: string | null;
  hire_date?: string | null;
  next_review_date?: string | null;
  nickname?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maps backend role values to human-friendly display labels */
const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Owner / Super Admin',
  operations_manager: 'Management',
  admin: 'Admin',
  supervisor: 'Supervisor',
  salesman: 'Project Manager',
  inventory_manager: 'Office Admin',
  shop_manager: 'Office Admin',
  operator: 'Operator',
  apprentice: 'Team Member',
};

const ROLE_GRADIENT: Record<string, string> = {
  super_admin: 'from-purple-500 to-indigo-600',
  operations_manager: 'from-indigo-500 to-blue-600',
  admin: 'from-blue-500 to-cyan-600',
  supervisor: 'from-teal-500 to-emerald-600',
  salesman: 'from-orange-500 to-amber-600',
  shop_manager: 'from-cyan-500 to-blue-600',
  inventory_manager: 'from-sky-500 to-blue-600',
  operator: 'from-green-500 to-emerald-600',
  apprentice: 'from-slate-400 to-slate-600',
};

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'bg-violet-50 text-violet-700 border-violet-200',
  operations_manager: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  admin: 'bg-blue-50 text-blue-700 border-blue-200',
  supervisor: 'bg-teal-50 text-teal-700 border-teal-200',
  shop_manager: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  inventory_manager: 'bg-sky-50 text-sky-700 border-sky-200',
  salesman: 'bg-orange-50 text-orange-700 border-orange-200',
  operator: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  apprentice: 'bg-slate-50 text-slate-700 border-slate-200',
};

const ROLE_ICON: Record<string, React.ElementType> = {
  super_admin: Crown,
  operations_manager: Shield,
  admin: Briefcase,
  supervisor: UserCheck,
  salesman: Star,
  shop_manager: Settings,
  inventory_manager: Settings,
  operator: User,
  apprentice: User,
};

/** Ordered list of roles used for tab filtering */
const ROLE_ORDER = [
  'super_admin',
  'operations_manager',
  'admin',
  'supervisor',
  'salesman',
  'inventory_manager',
  'shop_manager',
  'operator',
  'apprentice',
];

function getRoleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

// ─── Member Avatar ────────────────────────────────────────────────────────────

function MemberAvatar({
  member,
  size = 'md',
}: {
  member: Pick<TeamMember, 'full_name' | 'role' | 'profile_picture_url'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-16 h-16 text-xl' : 'w-10 h-10 text-sm';
  const gradient = ROLE_GRADIENT[member.role] || 'from-gray-400 to-gray-600';

  if (member.profile_picture_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.profile_picture_url}
        alt={member.full_name}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ring-2 ring-white`}
      />
    );
  }
  return (
    <div className={`${sizeClass} bg-gradient-to-br ${gradient} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {member.full_name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Role Badge Pill ──────────────────────────────────────────────────────────

function RolePill({ role }: { role: string }) {
  const RoleIcon = ROLE_ICON[role] || User;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-semibold ${ROLE_BADGE[role] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
      <RoleIcon className="w-3 h-3" />
      {getRoleLabel(role)}
    </span>
  );
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-semibold ${active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ─── Grant Super Admin Confirmation Dialog ────────────────────────────────────

function GrantSuperAdminDialog({
  member,
  onConfirm,
  onCancel,
  saving,
}: {
  member: TeamMember;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-sm">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Grant Super Admin</h3>
              <p className="text-sm text-gray-500">This action cannot be undone easily</p>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">
                <strong>{member.full_name}</strong> will gain full unrestricted access to all
                platform features, data, and admin controls. This should only be granted to
                trusted senior staff.
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={saving}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-3 font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={saving}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl py-3 font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
              {saving ? 'Granting...' : 'Grant Access'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-sm text-gray-700 break-all">{value || '—'}</p>
      </div>
    </div>
  );
}

// ─── EditableDateRow ──────────────────────────────────────────────────────────

function EditableDateRow({
  icon: Icon,
  label,
  value,
  onSave,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  onSave: (isoDate: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const startEditing = () => {
    // Convert display date to YYYY-MM-DD for the input
    let iso = '';
    if (value) {
      try {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          iso = d.toISOString().split('T')[0];
        }
      } catch { /* ignore */ }
    }
    setInputVal(iso);
    setEditing(true);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!inputVal) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(inputVal);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className="text-sm border border-violet-400 rounded-md px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-violet-500/30 text-gray-900"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs font-semibold px-2 py-0.5 bg-violet-600 hover:bg-violet-700 text-white rounded-md disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 group/date">
            <p className="text-sm text-gray-700">{value ? formatDate(value) : '—'}</p>
            <button
              onClick={startEditing}
              className="opacity-0 group-hover/date:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100"
              title="Edit hire date"
            >
              <Pencil className="w-3 h-3 text-gray-400 hover:text-violet-500 transition-colors" />
            </button>
            {saved && (
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ActionButton (for quick actions) ────────────────────────────────────────

function ActionButton({
  label,
  href,
  onClick,
  variant = 'default',
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'default' | 'danger' | 'success';
}) {
  const cls = `flex items-center justify-between px-4 py-3 rounded-xl transition-colors text-sm font-medium group ${
    variant === 'danger'
      ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
      : variant === 'success'
      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
      : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200'
  }`;

  if (href) {
    return (
      <Link href={href} className={cls}>
        <span>{label}</span>
        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={cls}>
      <span>{label}</span>
      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
    </button>
  );
}

// ─── Role-Specific Profile Info ───────────────────────────────────────────────

function ProfileInfoSection({
  member,
  onSaveHireDate,
}: {
  member: TeamMember;
  onSaveHireDate: (isoDate: string) => Promise<void>;
}) {
  const phone = member.phone_number || member.phone;

  // super_admin: name, email, DOB, join date
  if (member.role === 'super_admin') {
    return (
      <div className="space-y-3">
        <InfoRow icon={Mail} label="Email" value={member.email} />
        <InfoRow icon={Calendar} label="Date of Birth" value={formatDate(member.date_of_birth)} />
        <InfoRow icon={Clock} label="Member Since" value={formatDate(member.created_at)} />
      </div>
    );
  }

  // operator / apprentice: email, phone, hire_date, next_review_date
  if (member.role === 'operator' || member.role === 'apprentice') {
    return (
      <div className="space-y-3">
        <InfoRow icon={Mail} label="Email" value={member.email} />
        {phone && <InfoRow icon={Phone} label="Phone" value={phone} />}
        <EditableDateRow icon={Calendar} label="Hire Date" value={member.hire_date} onSave={onSaveHireDate} />
        <InfoRow icon={Clock} label="Next Review" value={formatDate(member.next_review_date)} />
      </div>
    );
  }

  // admin / operations_manager / salesman / supervisor / inventory_manager / shop_manager
  return (
    <div className="space-y-3">
      <InfoRow icon={Mail} label="Email" value={member.email} />
      {phone && <InfoRow icon={Phone} label="Phone" value={phone} />}
      <InfoRow icon={Calendar} label="Date of Birth" value={formatDate(member.date_of_birth)} />
      {member.nickname && <InfoRow icon={User} label="Nickname" value={member.nickname} />}
      <EditableDateRow icon={Clock} label="Hire Date" value={member.hire_date} onSave={onSaveHireDate} />
    </div>
  );
}

// ─── Role-Specific Quick Actions ──────────────────────────────────────────────

function QuickActionsSection({
  member,
  isSuperAdmin,
  onEditPermissions,
  onToggleActive,
}: {
  member: TeamMember;
  isSuperAdmin: boolean;
  onEditPermissions: () => void;
  onToggleActive: () => void;
}) {
  // super_admin: no quick actions
  if (member.role === 'super_admin') return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Quick Actions</h3>
      <ActionButton label="Edit Permissions" onClick={onEditPermissions} />
      {member.role === 'operator' && (
        <ActionButton label="View Timecards" href="/dashboard/admin/timecards" />
      )}
      <ActionButton
        label={member.active ? 'Deactivate Account' : 'Activate Account'}
        onClick={onToggleActive}
        variant={member.active ? 'danger' : 'success'}
      />
    </div>
  );
}

// ─── Skills & Proficiency Tab ─────────────────────────────────────────────────

const CUTTING_SCOPES: Array<{ key: string; label: string }> = [
  { key: 'core_drill', label: 'Core Drilling' },
  { key: 'slab_saw', label: 'Slab Saw' },
  { key: 'wall_saw', label: 'Wall Saw / Track Saw' },
  { key: 'push_saw', label: 'Push Saw' },
  { key: 'chain_saw', label: 'Chain Saw' },
  { key: 'hand_saw', label: 'Hand Saw' },
  { key: 'removal', label: 'Removal' },
  { key: 'demo', label: 'Demo' },
];

const HEAVY_EQUIPMENT: Array<{ key: string; label: string }> = [
  { key: 'mini_ex', label: 'Mini Excavator' },
  { key: 'skid_steer', label: 'Skid Steer' },
  { key: 'lull', label: 'Lull' },
  { key: 'forklift', label: 'Forklift' },
];

type SkillLevels = Record<string, number>;

function cuttingBandClasses(n: number, active: boolean): string {
  if (!active) {
    return 'bg-white border-2 border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 dark:bg-white/[0.04] dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/[0.08]';
  }
  if (n === 0) {
    return 'bg-slate-400 text-white shadow-lg shadow-slate-200 scale-110 dark:bg-slate-600 dark:shadow-black/30';
  }
  if (n <= 3) {
    return 'bg-emerald-600 text-white shadow-lg shadow-emerald-200 scale-110 dark:shadow-emerald-900/40';
  }
  if (n <= 6) {
    return 'bg-amber-500 text-white shadow-lg shadow-amber-200 scale-110 dark:shadow-amber-900/40';
  }
  return 'bg-rose-600 text-white shadow-lg shadow-rose-200 scale-110 dark:shadow-rose-900/40';
}

function equipmentBandClasses(n: number, active: boolean): string {
  if (!active) {
    return 'bg-white border-2 border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 dark:bg-white/[0.04] dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/[0.08]';
  }
  if (n === 0) {
    return 'bg-slate-400 text-white shadow-lg shadow-slate-200 scale-110 dark:bg-slate-600';
  }
  if (n <= 2) {
    return 'bg-amber-500 text-white shadow-lg shadow-amber-200 scale-110';
  }
  return 'bg-emerald-600 text-white shadow-lg shadow-emerald-200 scale-110';
}

function ScaleRow({
  label,
  value,
  max,
  onChange,
  bandFn,
  zeroLabel,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
  bandFn: (n: number, active: boolean) => string;
  zeroLabel: string;
}) {
  const nums = Array.from({ length: max + 1 }, (_, i) => i);
  return (
    <div className="py-2.5 border-b border-slate-100 dark:border-white/5 last:border-b-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
        {value === 0 && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {zeroLabel}
          </span>
        )}
      </div>
      <div className="flex gap-1.5 sm:gap-2 flex-wrap">
        {nums.map(n => {
          const isActive = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 ${bandFn(n, isActive)}`}
              aria-label={`${label} level ${n}`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SkillsTab({
  memberId,
  getAuthHeaders,
}: {
  memberId: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skillLevels, setSkillLevels] = useState<SkillLevels>({});
  const [initialLevels, setInitialLevels] = useState<SkillLevels>({});
  const [notes, setNotes] = useState('');
  const [initialNotes, setInitialNotes] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/admin/team-profiles/${memberId}/skills`, { headers });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || json.success === false) {
          setError(json.error || 'Failed to load skills');
          setSkillLevels({});
          setInitialLevels({});
          setNotes('');
          setInitialNotes('');
        } else {
          const data = json.data || {};
          const levels: SkillLevels = data.skill_levels || {};
          const n: string = data.notes || '';
          setSkillLevels(levels);
          setInitialLevels(levels);
          setNotes(n);
          setInitialNotes(n);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load skills');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [memberId, getAuthHeaders]);

  const dirty =
    notes !== initialNotes ||
    [...CUTTING_SCOPES, ...HEAVY_EQUIPMENT].some(s =>
      (skillLevels[s.key] ?? 0) !== (initialLevels[s.key] ?? 0)
    );

  const setLevel = (key: string, n: number) => {
    setSkillLevels(prev => ({ ...prev, [key]: n }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      // Ensure all known keys present (fill missing with 0)
      const payloadLevels: SkillLevels = {};
      for (const s of [...CUTTING_SCOPES, ...HEAVY_EQUIPMENT]) {
        payloadLevels[s.key] = skillLevels[s.key] ?? 0;
      }
      const res = await fetch(`/api/admin/team-profiles/${memberId}/skills`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ skill_levels: payloadLevels, notes }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        setError(json.error || 'Failed to save');
      } else {
        setInitialLevels(payloadLevels);
        setInitialNotes(notes);
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:border-red-900/50 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Cutting Scopes */}
      <div className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-5 dark:bg-white/[0.04] dark:ring-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <Wrench className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Cutting Scopes</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">0 = Not trained &middot; 1–3 Beginner &middot; 4–6 Proficient &middot; 7–10 Expert</p>
          </div>
        </div>
        <div>
          {CUTTING_SCOPES.map(s => (
            <ScaleRow
              key={s.key}
              label={s.label}
              value={skillLevels[s.key] ?? 0}
              max={10}
              onChange={n => setLevel(s.key, n)}
              bandFn={cuttingBandClasses}
              zeroLabel="Not trained"
            />
          ))}
        </div>
      </div>

      {/* Heavy Equipment */}
      <div className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-5 dark:bg-white/[0.04] dark:ring-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
            <Truck className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Heavy Equipment Proficiency</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">0 = Not qualified &middot; 1–2 Learning &middot; 3–5 Qualified</p>
          </div>
        </div>
        <div>
          {HEAVY_EQUIPMENT.map(s => (
            <ScaleRow
              key={s.key}
              label={s.label}
              value={skillLevels[s.key] ?? 0}
              max={5}
              onChange={n => setLevel(s.key, n)}
              bandFn={equipmentBandClasses}
              zeroLabel="Not qualified"
            />
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-5 dark:bg-white/[0.04] dark:ring-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
            <Award className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Notes</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Certifications, specialties, development goals</p>
          </div>
        </div>
        <textarea
          rows={5}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. OSHA 30 certified, working on wall saw certification..."
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors resize-none dark:bg-white/[0.04] dark:border-white/10 dark:text-slate-100 dark:placeholder-slate-500"
        />
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent dark:from-slate-900 dark:via-slate-900 pt-4 pb-1 -mx-1 px-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-h-[28px]">
            {dirty && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Unsaved changes
              </span>
            )}
            {!dirty && savedAt && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle className="w-3.5 h-3.5" />
                Saved
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-sm font-semibold shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Skills'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Skill Snapshot Card (compact summary for info tab) ──────────────────────

function SkillSnapshotCard({
  memberId,
  getAuthHeaders,
}: {
  memberId: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
}) {
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAuthHeaders().then(headers =>
      fetch(`/api/admin/team-profiles/${memberId}/skills`, { headers })
        .then(r => r.json())
        .then(json => {
          if (!cancelled) {
            setSkillLevels(json.data?.skill_levels || {});
            setLoaded(true);
          }
        })
        .catch(() => { if (!cancelled) setLoaded(true); })
    );
    return () => { cancelled = true; };
  }, [memberId, getAuthHeaders]);

  if (!loaded) return null;

  const cuttingItems = CUTTING_SCOPES.filter(s => (skillLevels[s.key] ?? 0) > 0);
  const equipItems = HEAVY_EQUIPMENT.filter(s => (skillLevels[s.key] ?? 0) > 0);

  if (cuttingItems.length === 0 && equipItems.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Skill Snapshot</h3>
        <span className="text-[10px] text-gray-400">out of 10 / 5</span>
      </div>
      <div className="space-y-2">
        {cuttingItems.map(s => {
          const val = skillLevels[s.key] ?? 0;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span className="text-xs text-gray-600 w-24 truncate">{s.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                <div className="bg-violet-500 h-1.5 rounded-full" style={{ width: `${(val / 10) * 100}%` }} />
              </div>
              <span className="text-[11px] font-bold text-gray-700 w-4 text-right">{val}</span>
            </div>
          );
        })}
        {equipItems.map(s => {
          const val = skillLevels[s.key] ?? 0;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span className="text-xs text-gray-600 w-24 truncate">{s.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${(val / 5) * 100}%` }} />
              </div>
              <span className="text-[11px] font-bold text-gray-700 w-4 text-right">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Credentials Tab ──────────────────────────────────────────────────────────

interface CertEntry {
  name: string;
  expiry: string | null;
  issued_by: string | null;
}

interface CredentialsData {
  medical_card_expiry: string | null;
  drivers_license_expiry: string | null;
  drivers_license_class: string | null;
  osha_10_expiry: string | null;
  osha_30_expiry: string | null;
  certifications: CertEntry[] | null;
}

function expiryStatus(dateStr: string | null): 'expired' | 'soon' | 'valid' | 'none' {
  if (!dateStr) return 'none';
  const d = new Date(dateStr);
  const now = new Date();
  if (d < now) return 'expired';
  const days = (d.getTime() - now.getTime()) / 86400000;
  return days <= 30 ? 'soon' : 'valid';
}

function ExpiryBadge({ dateStr }: { dateStr: string | null }) {
  const status = expiryStatus(dateStr);
  if (status === 'none') return null;
  const map = {
    expired: 'bg-red-50 text-red-700 border-red-200',
    soon: 'bg-amber-50 text-amber-700 border-amber-200',
    valid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  } as const;
  const label = {
    expired: 'EXPIRED',
    soon: 'Expires soon',
    valid: 'Valid',
  } as const;
  const Icon = status === 'expired' ? AlertTriangle : status === 'soon' ? AlertTriangle : CheckCircle;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${map[status]}`}>
      <Icon className="w-2.5 h-2.5" />
      {label[status]}
    </span>
  );
}

function CredentialDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const status = expiryStatus(value || null);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{label}</label>
        <ExpiryBadge dateStr={value || null} />
      </div>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-colors ${
          status === 'expired'
            ? 'border-red-300 bg-red-50/40'
            : status === 'soon'
            ? 'border-amber-300 bg-amber-50/40'
            : 'border-slate-200 bg-white'
        }`}
      />
    </div>
  );
}

function CredentialsTab({
  memberId,
  getAuthHeaders,
}: {
  memberId: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [medicalExpiry, setMedicalExpiry] = useState('');
  const [dlExpiry, setDlExpiry] = useState('');
  const [dlClass, setDlClass] = useState('');
  const [osha10Expiry, setOsha10Expiry] = useState('');
  const [osha30Expiry, setOsha30Expiry] = useState('');
  const [certs, setCerts] = useState<CertEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/admin/team-profiles/${memberId}/credentials`, { headers });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || json.success === false) {
          setError(json.error || 'Failed to load credentials');
        } else {
          const d: CredentialsData = json.data || {};
          setMedicalExpiry(d.medical_card_expiry || '');
          setDlExpiry(d.drivers_license_expiry || '');
          setDlClass(d.drivers_license_class || '');
          setOsha10Expiry(d.osha_10_expiry || '');
          setOsha30Expiry(d.osha_30_expiry || '');
          setCerts(Array.isArray(d.certifications) ? d.certifications : []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [memberId, getAuthHeaders]);

  const addCert = () => {
    setCerts(prev => [...prev, { name: '', expiry: null, issued_by: null }]);
  };

  const removeCert = (idx: number) => {
    setCerts(prev => prev.filter((_, i) => i !== idx));
  };

  const updateCert = (idx: number, patch: Partial<CertEntry>) => {
    setCerts(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const payload = {
        medical_card_expiry: medicalExpiry || null,
        drivers_license_expiry: dlExpiry || null,
        drivers_license_class: dlClass || null,
        osha_10_expiry: osha10Expiry || null,
        osha_30_expiry: osha30Expiry || null,
        certifications: certs.filter(c => c.name.trim() !== '').map(c => ({
          name: c.name.trim(),
          expiry: c.expiry || null,
          issued_by: c.issued_by?.trim() || null,
        })),
      };
      const res = await fetch(`/api/admin/team-profiles/${memberId}/credentials`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        setError(json.error || 'Failed to save');
      } else {
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Medical Card */}
      <div className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-gradient-to-br from-rose-500 to-pink-600 rounded-lg flex items-center justify-center">
            <IdCard className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Medical Card</h3>
            <p className="text-[11px] text-slate-500">DOT/operator medical certification</p>
          </div>
        </div>
        <CredentialDateField
          label="Expiry Date"
          value={medicalExpiry}
          onChange={setMedicalExpiry}
        />
      </div>

      {/* Driver's License */}
      <div className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <Truck className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Driver&apos;s License</h3>
            <p className="text-[11px] text-slate-500">License class and expiry</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">License Class</label>
            <input
              type="text"
              value={dlClass}
              onChange={e => setDlClass(e.target.value)}
              placeholder="e.g. CDL Class A, Class C"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-colors"
            />
          </div>
          <CredentialDateField
            label="Expiry Date"
            value={dlExpiry}
            onChange={setDlExpiry}
          />
        </div>
      </div>

      {/* OSHA Certifications */}
      <div className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
            <Award className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">OSHA Certifications</h3>
            <p className="text-[11px] text-slate-500">OSHA 10 and OSHA 30 expiry dates</p>
          </div>
        </div>
        <div className="space-y-3">
          <CredentialDateField
            label="OSHA-10 Expiry"
            value={osha10Expiry}
            onChange={setOsha10Expiry}
          />
          <CredentialDateField
            label="OSHA-30 Expiry"
            value={osha30Expiry}
            onChange={setOsha30Expiry}
          />
        </div>
      </div>

      {/* Freeform Certifications */}
      <div className="bg-white/90 ring-1 ring-slate-200 shadow-sm rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Other Certifications</h3>
              <p className="text-[11px] text-slate-500">Any additional credentials or certifications</p>
            </div>
          </div>
          <button
            type="button"
            onClick={addCert}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-lg text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        {certs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4 italic">No additional certifications added</p>
        ) : (
          <div className="space-y-3">
            {certs.map((cert, idx) => (
              <div key={idx} className="flex gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex-1 space-y-2 min-w-0">
                  <input
                    type="text"
                    value={cert.name}
                    onChange={e => updateCert(idx, { name: e.target.value })}
                    placeholder="Certification name"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-colors"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Expiry</label>
                        <ExpiryBadge dateStr={cert.expiry} />
                      </div>
                      <input
                        type="date"
                        value={cert.expiry || ''}
                        onChange={e => updateCert(idx, { expiry: e.target.value || null })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-colors"
                      />
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Issued By</label>
                      <input
                        type="text"
                        value={cert.issued_by || ''}
                        onChange={e => updateCert(idx, { issued_by: e.target.value || null })}
                        placeholder="Issuing body"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-colors"
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeCert(idx)}
                  className="self-start mt-0.5 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent pt-4 pb-1 -mx-1 px-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-h-[28px]">
            {savedAt && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle className="w-3.5 h-3.5" />
                Saved
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-sm font-semibold shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Credentials'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Member Detail Panel ──────────────────────────────────────────────────────

type DetailTab = 'info' | 'skills' | 'credentials' | 'permissions';

function MemberDetailPanel({
  member,
  isSuperAdmin,
  currentUserId,
  onClose,
  onGrantSuperAdmin,
  onToggleActive,
  getAuthHeaders,
  onHireDateSaved,
}: {
  member: TeamMember;
  isSuperAdmin: boolean;
  currentUserId: string;
  onClose: () => void;
  onGrantSuperAdmin: (member: TeamMember) => void;
  onToggleActive: (member: TeamMember) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onHireDateSaved: (memberId: string, isoDate: string) => void;
}) {
  const [tab, setTab] = useState<DetailTab>('info');
  const [flags, setFlags] = useState<Partial<UserFeatureFlags> | null>(null);
  const [loadingFlags, setLoadingFlags] = useState(false);

  const handleSaveHireDate = async (isoDate: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/profiles/${member.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ hire_date: isoDate }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to save hire date');
    onHireDateSaved(member.id, isoDate);
  };

  useEffect(() => {
    // Reset tab when member changes
    setTab('info');
    setFlags(null);
  }, [member.id]);

  useEffect(() => {
    if (tab === 'permissions' && flags === null) {
      setLoadingFlags(true);
      getAuthHeaders().then(headers =>
        fetch(`/api/admin/user-flags/${member.id}`, { headers })
          .then(r => r.json())
          .then(json => setFlags(json.data || {}))
          .catch(() => setFlags({}))
          .finally(() => setLoadingFlags(false))
      );
    }
  }, [tab, member.id, flags, getAuthHeaders]);

  const isOwnProfile = member.id === currentUserId;
  const canGrant = isSuperAdmin && !isOwnProfile && member.role !== 'super_admin';
  const showPermissionsTab = member.role !== 'super_admin';
  const showSkillsTab = member.role === 'operator' || member.role === 'apprentice';
  const showCredentialsTab = member.role === 'operator' || member.role === 'apprentice';
  const showTabBar = showPermissionsTab || showSkillsTab || showCredentialsTab;

  const visibleTabs: DetailTab[] = [
    'info',
    ...(showSkillsTab ? (['skills'] as DetailTab[]) : []),
    ...(showCredentialsTab ? (['credentials'] as DetailTab[]) : []),
    ...(showPermissionsTab ? (['permissions'] as DetailTab[]) : []),
  ];

  const tabLabel: Record<DetailTab, string> = {
    info: 'Profile Info',
    skills: 'Skills',
    credentials: 'Credentials',
    permissions: 'Feature Permissions',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`relative bg-gradient-to-r ${ROLE_GRADIENT[member.role] || 'from-gray-600 to-gray-700'} p-6 flex-shrink-0`}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-4">
          <MemberAvatar member={member} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-white">{member.full_name}</h2>
              {member.role === 'super_admin' && (
                <Crown className="w-4 h-4 text-yellow-300" />
              )}
            </div>
            {member.nickname && (
              <p className="text-sm text-white/70 mt-0.5">&ldquo;{member.nickname}&rdquo;</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <RolePill role={member.role} />
              <StatusBadge active={member.active} />
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      {showTabBar && (
        <div className="flex gap-1 px-4 pt-4 flex-shrink-0 border-b border-gray-200 pb-0 overflow-x-auto">
          {visibleTabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 rounded-t-lg text-sm font-semibold transition-all whitespace-nowrap ${
                tab === t
                  ? 'bg-violet-600 text-white'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {tabLabel[t]}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-gray-50">
        {(tab === 'info' || !showTabBar) && (
          <>
            {/* Profile Info */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Profile Info</h3>
              <ProfileInfoSection member={member} onSaveHireDate={handleSaveHireDate} />
            </div>

            {/* Skill Snapshot — operators/apprentices only */}
            {showSkillsTab && (
              <SkillSnapshotCard memberId={member.id} getAuthHeaders={getAuthHeaders} />
            )}

            {/* Quick Actions */}
            <QuickActionsSection
              member={member}
              isSuperAdmin={isSuperAdmin}
              onEditPermissions={() => setTab('permissions')}
              onToggleActive={() => onToggleActive(member)}
            />

            {/* Grant Super Admin — only for super admins editing non-super-admin users */}
            {canGrant && (
              <div className="pt-2 border-t border-gray-200">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Crown className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-gray-900 mb-1">Elevate to Super Admin</h4>
                      <p className="text-xs text-gray-600 mb-3">
                        Grants full unrestricted platform access. Cannot be undone without manual database access.
                      </p>
                      <button
                        onClick={() => onGrantSuperAdmin(member)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
                      >
                        <Crown className="w-4 h-4" />
                        Grant Super Admin
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'skills' && showSkillsTab && (
          <SkillsTab memberId={member.id} getAuthHeaders={getAuthHeaders} />
        )}

        {tab === 'credentials' && showCredentialsTab && (
          <CredentialsTab memberId={member.id} getAuthHeaders={getAuthHeaders} />
        )}

        {tab === 'permissions' && showPermissionsTab && (
          <div>
            {loadingFlags ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
              </div>
            ) : (
              <FeatureFlagsPanel
                userId={member.id}
                initialFlags={flags || {}}
                readOnly={!isSuperAdmin}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeamProfilesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [grantTarget, setGrantTarget] = useState<TeamMember | null>(null);
  const [grantSaving, setGrantSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    };
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/users', { headers });
      const json = await res.json();
      if (res.ok && json.data) {
        setMembers(json.data);
      }
    } catch (e) {
      console.error('Error fetching team members:', e);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      const role = user.user_metadata?.role || 'operator';
      setUserRole(role);

      const bypassRoles = ['super_admin', 'operations_manager'];
      const adminRoles = ['super_admin', 'operations_manager', 'admin'];
      if (!adminRoles.includes(role)) {
        // Fall back to feature flag: allow if can_manage_team is true
        let canManageTeam = false;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (token) {
            const resp = await fetch(`/api/admin/user-flags/${user.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const json = await resp.json();
            canManageTeam = Boolean(json?.data?.can_manage_team);
          }
        } catch {
          canManageTeam = false;
        }
        if (!bypassRoles.includes(role) && !canManageTeam) {
          router.push('/dashboard/admin');
          return;
        }
      }

      await fetchMembers();
      setLoading(false);
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isSuperAdmin = userRole === 'super_admin';

  const handleGrantSuperAdmin = async () => {
    if (!grantTarget) return;
    setGrantSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/grant-super-admin', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: grantTarget.id }),
      });
      const json = await res.json();
      if (json.success) {
        setGrantTarget(null);
        setSelectedMember(null);
        setSuccessMsg(`${grantTarget.full_name} has been granted Super Admin access.`);
        setTimeout(() => setSuccessMsg(''), 4000);
        await fetchMembers();
      } else {
        alert(json.error || 'Failed to grant super admin');
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'An error occurred');
    } finally {
      setGrantSaving(false);
    }
  };

  const handleToggleActive = useCallback(async (member: TeamMember) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/users/${member.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ active: !member.active }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`${member.full_name} has been ${member.active ? 'deactivated' : 'activated'}.`);
        setTimeout(() => setSuccessMsg(''), 4000);
        await fetchMembers();
        setSelectedMember(null);
      } else {
        alert(json.error || 'Failed to update user status');
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'An error occurred');
    }
  }, [getAuthHeaders, fetchMembers]);

  // Filtered + sorted members
  const allRoles = Array.from(new Set(members.map(m => m.role)))
    .sort((a, b) => {
      const ai = ROLE_ORDER.indexOf(a);
      const bi = ROLE_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

  const filtered = members.filter(m => {
    if (roleFilter !== 'all' && m.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
    }
    return true;
  });

  const roleBreakdown = allRoles.reduce((acc, r) => {
    acc[r] = members.filter(m => m.role === r).length;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-white" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-violet-600 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/admin"
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-600"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-gray-900">Team Profiles</h1>
                <p className="text-xs text-gray-500 hidden sm:block">
                  {members.length} members &middot; Manage access &amp; feature permissions
                </p>
              </div>
            </div>
          </div>

          {isSuperAdmin && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-semibold text-sm transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Invite Member</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Success banner ──────────────────────────────────────── */}
      {successMsg && (
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pt-4">
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <p className="text-emerald-700 text-sm">{successMsg}</p>
          </div>
        </div>
      )}

      {/* ── Main layout ─────────────────────────────────────────── */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Staff', value: members.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Active', value: members.filter(m => m.active).length, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Super Admins', value: members.filter(m => m.role === 'super_admin').length, icon: Crown, color: 'text-violet-600', bg: 'bg-violet-50' },
            { label: 'Roles In Use', value: allRoles.filter(r => roleBreakdown[r] > 0).length, icon: Shield, color: 'text-orange-600', bg: 'bg-orange-50' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`w-9 h-9 ${stat.bg} rounded-lg flex items-center justify-center`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Two-column layout: list + detail */}
        <div className={`grid gap-6 ${selectedMember ? 'lg:grid-cols-[1fr,400px]' : 'grid-cols-1'}`}>

          {/* ── Member List ──────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Search + filter toolbar */}
            <div className="p-4 border-b border-gray-200 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors"
                />
              </div>

              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setRoleFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    roleFilter === 'all'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                  }`}
                >
                  All ({members.length})
                </button>
                {allRoles.filter(r => roleBreakdown[r] > 0).map(role => (
                  <button
                    key={role}
                    onClick={() => setRoleFilter(role)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      roleFilter === role
                        ? `bg-gradient-to-r ${ROLE_GRADIENT[role] || 'from-gray-500 to-gray-600'} text-white`
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                    }`}
                  >
                    {getRoleLabel(role)} ({roleBreakdown[role]})
                  </button>
                ))}
              </div>
            </div>

            {/* Member rows */}
            {filtered.length === 0 ? (
              <div className="p-10 text-center">
                <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">
                  {search || roleFilter !== 'all' ? 'No members match your filters.' : 'No team members yet.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filtered.map(member => {
                  const isSelected = selectedMember?.id === member.id;
                  return (
                    <button
                      key={member.id}
                      onClick={() => setSelectedMember(isSelected ? null : member)}
                      className={`w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors border-l-2 ${
                        isSelected
                          ? 'bg-violet-50 border-violet-500'
                          : 'border-transparent hover:bg-gray-50 hover:border-violet-300'
                      }`}
                    >
                      <MemberAvatar member={member} size="md" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">{member.full_name}</span>
                          {member.role === 'super_admin' && (
                            <Crown className="w-3 h-3 text-violet-600" />
                          )}
                          <RolePill role={member.role} />
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{member.email}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`w-2 h-2 rounded-full ${member.active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Detail Panel ─────────────────────────────────────── */}
          {selectedMember && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-200px)] sticky top-24">
              <MemberDetailPanel
                member={selectedMember}
                isSuperAdmin={isSuperAdmin}
                currentUserId={userId || ''}
                onClose={() => setSelectedMember(null)}
                onGrantSuperAdmin={setGrantTarget}
                onToggleActive={handleToggleActive}
                getAuthHeaders={getAuthHeaders}
                onHireDateSaved={(memberId, isoDate) => {
                  setMembers(prev => prev.map(m => m.id === memberId ? { ...m, hire_date: isoDate } : m));
                  setSelectedMember(prev => prev && prev.id === memberId ? { ...prev, hire_date: isoDate } : prev);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {showInviteModal && (
        <InviteMemberModal
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            setSuccessMsg('Invitation sent successfully! The user will receive an email to set up their account.');
            setTimeout(() => setSuccessMsg(''), 5000);
            fetchMembers();
          }}
        />
      )}

      {grantTarget && (
        <GrantSuperAdminDialog
          member={grantTarget}
          onConfirm={handleGrantSuperAdmin}
          onCancel={() => setGrantTarget(null)}
          saving={grantSaving}
        />
      )}
    </div>
  );
}
