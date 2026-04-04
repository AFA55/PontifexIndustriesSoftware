'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Building2, Plus, Search, MapPin, Shield, AlertTriangle,
  CheckCircle, XCircle, Clock, BadgeCheck, ChevronDown, ChevronUp,
  Loader2, X, ToggleLeft, ToggleRight, Trash2, Edit2, Users
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';

// ============================================================
// Types
// ============================================================

interface Facility {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  special_requirements: string | null;
  orientation_required: boolean;
  badging_required: boolean;
  compliance_documents: any;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

interface Badge {
  id: string;
  operator_id: string;
  facility_id: string;
  badge_number: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  status: string;
  notes: string | null;
  operator_name: string;
  operator_email?: string;
  facility_name: string;
  expiry_status: string;
}

interface Operator {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

// ============================================================
// API helper
// ============================================================

function apiFetch(url: string, opts?: RequestInit) {
  const stored = typeof window !== 'undefined' ? localStorage.getItem('supabase-user') : null;
  const token = stored ? JSON.parse(stored).session?.access_token : null;
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
}

// ============================================================
// Date helpers
// ============================================================

function formatDate(d: string | null) {
  if (!d) return '--';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function expiryColor(status: string) {
  switch (status) {
    case 'valid': return 'bg-green-100 text-green-700 border-green-200';
    case 'expiring_soon': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'expired': return 'bg-red-100 text-red-700 border-red-200';
    case 'no_expiry': return 'bg-gray-100 text-gray-600 border-gray-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

function expiryLabel(status: string) {
  switch (status) {
    case 'valid': return 'Valid';
    case 'expiring_soon': return 'Expiring Soon';
    case 'expired': return 'Expired';
    case 'no_expiry': return 'No Expiry';
    default: return status;
  }
}

function badgeStatusColor(status: string) {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-700';
    case 'expired': return 'bg-red-100 text-red-700';
    case 'revoked': return 'bg-gray-100 text-gray-700';
    case 'pending': return 'bg-yellow-100 text-yellow-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

// ============================================================
// Add Facility Modal
// ============================================================

function AddFacilityModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', address: '', city: '', state: '', zip: '',
    special_requirements: '', orientation_required: false, badging_required: false, notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/facilities', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to create facility'); return; }
      onSaved();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-5 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-600" />
              Add Facility
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Facility Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" placeholder="e.g., Intel D1X Fab" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" placeholder="Street address" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input type="text" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" maxLength={2} placeholder="OR" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                <input type="text" value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" maxLength={10} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Special Requirements</label>
              <textarea value={form.special_requirements} onChange={e => setForm({ ...form, special_requirements: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" rows={2}
                placeholder="PPE requirements, site rules, etc." />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => setForm({ ...form, orientation_required: !form.orientation_required })}
                  className="text-purple-600">
                  {form.orientation_required ? <ToggleRight className="w-8 h-5" /> : <ToggleLeft className="w-8 h-5 text-gray-400" />}
                </button>
                <span className="text-sm text-gray-700">Orientation Required</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => setForm({ ...form, badging_required: !form.badging_required })}
                  className="text-purple-600">
                  {form.badging_required ? <ToggleRight className="w-8 h-5" /> : <ToggleLeft className="w-8 h-5 text-gray-400" />}
                </button>
                <span className="text-sm text-gray-700">Badging Required</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" rows={2} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Creating...' : 'Create Facility'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ============================================================
// Edit Facility Modal
// ============================================================

function EditFacilityModal({ facility, onClose, onSaved }: { facility: Facility; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: facility.name,
    address: facility.address || '',
    city: facility.city || '',
    state: facility.state || '',
    zip: facility.zip || '',
    special_requirements: facility.special_requirements || '',
    orientation_required: facility.orientation_required,
    badging_required: facility.badging_required,
    notes: facility.notes || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(`/api/admin/facilities/${facility.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to update facility'); return; }
      onSaved();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-5 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-purple-600" />
              Edit Facility
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Facility Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input type="text" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" maxLength={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                <input type="text" value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" maxLength={10} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Special Requirements</label>
              <textarea value={form.special_requirements} onChange={e => setForm({ ...form, special_requirements: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" rows={2} />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => setForm({ ...form, orientation_required: !form.orientation_required })}
                  className="text-purple-600">
                  {form.orientation_required ? <ToggleRight className="w-8 h-5" /> : <ToggleLeft className="w-8 h-5 text-gray-400" />}
                </button>
                <span className="text-sm text-gray-700">Orientation Required</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => setForm({ ...form, badging_required: !form.badging_required })}
                  className="text-purple-600">
                  {form.badging_required ? <ToggleRight className="w-8 h-5" /> : <ToggleLeft className="w-8 h-5 text-gray-400" />}
                </button>
                <span className="text-sm text-gray-700">Badging Required</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" rows={2} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ============================================================
// Add Badge Modal
// ============================================================

function AddBadgeModal({
  operators, facilities, preselectedOperatorId, preselectedFacilityId,
  onClose, onSaved
}: {
  operators: Operator[];
  facilities: Facility[];
  preselectedOperatorId?: string;
  preselectedFacilityId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    operator_id: preselectedOperatorId || '',
    facility_id: preselectedFacilityId || '',
    badge_number: '',
    issued_date: new Date().toISOString().split('T')[0],
    expiry_date: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.operator_id || !form.facility_id) { setError('Operator and facility are required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/badges', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          expiry_date: form.expiry_date || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to create badge'); return; }
      onSaved();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div className="flex items-center justify-between p-5 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-purple-600" />
              Add Badge
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Operator *</label>
              <select value={form.operator_id} onChange={e => setForm({ ...form, operator_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm">
                <option value="">Select operator...</option>
                {operators.map(op => (
                  <option key={op.id} value={op.id}>{op.full_name} ({op.email})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Facility *</label>
              <select value={form.facility_id} onChange={e => setForm({ ...form, facility_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm">
                <option value="">Select facility...</option>
                {facilities.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Badge Number</label>
              <input type="text" value={form.badge_number} onChange={e => setForm({ ...form, badge_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" placeholder="e.g., B-12345" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issued Date</label>
                <input type="date" value={form.issued_date} onChange={e => setForm({ ...form, issued_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                <input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" rows={2} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Creating...' : 'Create Badge'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ============================================================
// Facility Row (expandable with badges)
// ============================================================

function FacilityRow({ facility, onEdit, onDelete, onAddBadge }: {
  facility: Facility;
  onEdit: () => void;
  onDelete: () => void;
  onAddBadge: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchBadges = useCallback(async () => {
    if (!expanded) return;
    setLoadingBadges(true);
    try {
      const res = await apiFetch(`/api/admin/facilities/${facility.id}/badges`);
      if (res.ok) {
        const json = await res.json();
        setBadges(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load badges:', err);
    } finally {
      setLoadingBadges(false);
    }
  }, [expanded, facility.id]);

  useEffect(() => { fetchBadges(); }, [fetchBadges]);

  const handleRevoke = async (badgeId: string) => {
    setRevoking(badgeId);
    try {
      const res = await apiFetch(`/api/admin/badges/${badgeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'revoked' }),
      });
      if (res.ok) {
        setBadges(prev => prev.map(b => b.id === badgeId ? { ...b, status: 'revoked' } : b));
      }
    } catch (err) {
      console.error('Failed to revoke badge:', err);
    } finally {
      setRevoking(null);
    }
  };

  const address = [facility.address, facility.city, facility.state, facility.zip].filter(Boolean).join(', ');

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div
        className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-base font-bold text-gray-900 truncate">{facility.name}</h3>
              <div className="flex items-center gap-1.5">
                {facility.badging_required && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded-full flex items-center gap-1">
                    <BadgeCheck className="w-3 h-3" /> Badging
                  </span>
                )}
                {facility.orientation_required && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Orientation
                  </span>
                )}
              </div>
            </div>
            {address && (
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> {address}
              </p>
            )}
            {facility.special_requirements && (
              <p className="text-xs text-gray-400 mt-1 line-clamp-1">{facility.special_requirements}</p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors" title="Edit facility">
              <Edit2 className="w-4 h-4 text-gray-400" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-2 hover:bg-red-50 rounded-xl transition-colors" title="Deactivate facility">
              <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
            </button>
            {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-500" />
              Badged Operators
            </h4>
            <button onClick={onAddBadge}
              className="text-xs font-medium text-purple-600 hover:text-purple-800 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add Badge
            </button>
          </div>
          {loadingBadges ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
            </div>
          ) : badges.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No badges issued for this facility</p>
          ) : (
            <div className="space-y-2">
              {badges.map(badge => (
                <div key={badge.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{badge.operator_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {badge.badge_number && (
                        <span className="text-xs text-gray-500">#{badge.badge_number}</span>
                      )}
                      <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full border ${expiryColor(badge.expiry_status)}`}>
                        {expiryLabel(badge.expiry_status)}
                      </span>
                      <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${badgeStatusColor(badge.status)}`}>
                        {badge.status}
                      </span>
                      {badge.expiry_date && (
                        <span className="text-[10px] text-gray-400">Exp: {formatDate(badge.expiry_date)}</span>
                      )}
                    </div>
                  </div>
                  {badge.status === 'active' && (
                    <button
                      onClick={() => handleRevoke(badge.id)}
                      disabled={revoking === badge.id}
                      className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {revoking === badge.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function FacilitiesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'facilities' | 'badges'>('facilities');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showAddFacility, setShowAddFacility] = useState(false);
  const [editFacility, setEditFacility] = useState<Facility | null>(null);
  const [showAddBadge, setShowAddBadge] = useState(false);
  const [preselectedFacilityId, setPreselectedFacilityId] = useState<string | undefined>();

  // Auth guard
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    if (!['admin', 'super_admin', 'operations_manager'].includes(currentUser.role || '')) {
      router.push('/dashboard');
    }
  }, [router]);

  // Fetch data
  const fetchFacilities = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/facilities?active_only=false');
      if (res.ok) {
        const json = await res.json();
        setFacilities(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch facilities:', err);
    }
  }, []);

  const fetchBadges = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/badges');
      if (res.ok) {
        const json = await res.json();
        setBadges(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch badges:', err);
    }
  }, []);

  const fetchOperators = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/operator-profiles');
      if (res.ok) {
        const json = await res.json();
        setOperators((json.data || []).map((op: any) => ({
          id: op.id, full_name: op.full_name, email: op.email, role: op.role,
        })));
      }
    } catch (err) {
      console.error('Failed to fetch operators:', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchFacilities(), fetchBadges(), fetchOperators()]).finally(() => setLoading(false));
  }, [fetchFacilities, fetchBadges, fetchOperators]);

  const handleDeleteFacility = async (id: string) => {
    if (!confirm('Deactivate this facility? It will be hidden but not deleted.')) return;
    try {
      const res = await apiFetch(`/api/admin/facilities/${id}`, { method: 'DELETE' });
      if (res.ok) fetchFacilities();
    } catch (err) {
      console.error('Failed to deactivate facility:', err);
    }
  };

  const handleRevokeBadge = async (badgeId: string) => {
    try {
      const res = await apiFetch(`/api/admin/badges/${badgeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'revoked' }),
      });
      if (res.ok) fetchBadges();
    } catch (err) {
      console.error('Failed to revoke badge:', err);
    }
  };

  // Filter
  const filteredFacilities = facilities.filter(f => {
    if (!search) return f.is_active;
    const s = search.toLowerCase();
    return f.is_active && (
      f.name.toLowerCase().includes(s) ||
      (f.city || '').toLowerCase().includes(s) ||
      (f.state || '').toLowerCase().includes(s) ||
      (f.address || '').toLowerCase().includes(s)
    );
  });

  // Group badges by facility
  const badgesByFacility: Record<string, Badge[]> = {};
  badges.forEach(b => {
    const key = b.facility_name || b.facility_id;
    if (!badgesByFacility[key]) badgesByFacility[key] = [];
    badgesByFacility[key].push(b);
  });

  const filteredBadgeGroups = Object.entries(badgesByFacility).filter(([name]) => {
    if (!search) return true;
    return name.toLowerCase().includes(search.toLowerCase());
  });

  // Stats
  const activeBadges = badges.filter(b => b.status === 'active');
  const expiringBadges = badges.filter(b => b.expiry_status === 'expiring_soon');
  const expiredBadges = badges.filter(b => b.expiry_status === 'expired' && b.status === 'active');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/dashboard/admin" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Building2 className="w-6 h-6 text-purple-600" />
                Facilities & Badges
              </h1>
              <p className="text-gray-500 text-sm">Manage facility compliance and operator badging</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{facilities.filter(f => f.is_active).length}</p>
              <p className="text-xs text-gray-500">Active Facilities</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{activeBadges.length}</p>
              <p className="text-xs text-gray-500">Active Badges</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{expiringBadges.length}</p>
              <p className="text-xs text-amber-600">Expiring Soon</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{expiredBadges.length}</p>
              <p className="text-xs text-red-500">Expired (Active)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1">
            <button
              onClick={() => setActiveTab('facilities')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'facilities' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Facilities
            </button>
            <button
              onClick={() => setActiveTab('badges')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'badges' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Badging Overview
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder={activeTab === 'facilities' ? 'Search facilities...' : 'Search by facility...'}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              />
            </div>
            <button
              onClick={() => activeTab === 'facilities' ? setShowAddFacility(true) : setShowAddBadge(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              {activeTab === 'facilities' ? 'Add Facility' : 'Add Badge'}
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          </div>
        ) : activeTab === 'facilities' ? (
          /* Facilities Tab */
          <div className="space-y-3 pb-8">
            {filteredFacilities.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 text-sm">
                  {search ? 'No facilities match your search' : 'No facilities yet. Add your first facility to get started.'}
                </p>
              </div>
            ) : (
              filteredFacilities.map(facility => (
                <FacilityRow
                  key={facility.id}
                  facility={facility}
                  onEdit={() => setEditFacility(facility)}
                  onDelete={() => handleDeleteFacility(facility.id)}
                  onAddBadge={() => {
                    setPreselectedFacilityId(facility.id);
                    setShowAddBadge(true);
                  }}
                />
              ))
            )}
          </div>
        ) : (
          /* Badging Overview Tab */
          <div className="space-y-4 pb-8">
            {filteredBadgeGroups.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <BadgeCheck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 text-sm">
                  {search ? 'No badges match your search' : 'No badges issued yet.'}
                </p>
              </div>
            ) : (
              filteredBadgeGroups.map(([facilityName, facilityBadges]) => (
                <div key={facilityName} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-purple-500" />
                      {facilityName}
                      <span className="px-2 py-0.5 bg-purple-100 rounded-full text-xs text-purple-700 font-bold">
                        {facilityBadges.length}
                      </span>
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {facilityBadges.map(badge => (
                      <div key={badge.id} className="px-5 py-3 flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900">{badge.operator_name}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {badge.badge_number && (
                              <span className="text-xs text-gray-500">#{badge.badge_number}</span>
                            )}
                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full border ${expiryColor(badge.expiry_status)}`}>
                              {expiryLabel(badge.expiry_status)}
                            </span>
                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${badgeStatusColor(badge.status)}`}>
                              {badge.status}
                            </span>
                            {badge.issued_date && (
                              <span className="text-[10px] text-gray-400">Issued: {formatDate(badge.issued_date)}</span>
                            )}
                            {badge.expiry_date && (
                              <span className="text-[10px] text-gray-400">Exp: {formatDate(badge.expiry_date)}</span>
                            )}
                          </div>
                        </div>
                        {badge.status === 'active' && (
                          <button
                            onClick={() => handleRevokeBadge(badge.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddFacility && (
        <AddFacilityModal onClose={() => setShowAddFacility(false)} onSaved={fetchFacilities} />
      )}
      {editFacility && (
        <EditFacilityModal facility={editFacility} onClose={() => setEditFacility(null)} onSaved={fetchFacilities} />
      )}
      {showAddBadge && (
        <AddBadgeModal
          operators={operators}
          facilities={facilities.filter(f => f.is_active)}
          preselectedFacilityId={preselectedFacilityId}
          onClose={() => { setShowAddBadge(false); setPreselectedFacilityId(undefined); }}
          onSaved={() => { fetchBadges(); }}
        />
      )}
    </div>
  );
}
