'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';
import {
  ArrowLeft, Smartphone, Plus, Wifi, WifiOff, Truck, Building2, Factory,
  Search, Trash2, Edit, CheckCircle, XCircle, RefreshCw, Tag, MapPin
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface NfcTag {
  id: string;
  tag_uid: string;
  tag_type: 'shop' | 'truck' | 'jobsite';
  label: string;
  truck_number: string | null;
  jobsite_address: string | null;
  is_active: boolean;
  registered_by: string | null;
  last_scanned_at: string | null;
  last_scanned_by: string | null;
  created_at: string;
  updated_at: string | null;
}

const TAG_TYPE_CONFIG = {
  shop: { label: 'Shop', icon: Factory, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  truck: { label: 'Truck', icon: Truck, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  jobsite: { label: 'Jobsite', icon: MapPin, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
};

export default function NfcManagementPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tags, setTags] = useState<NfcTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTag, setEditingTag] = useState<NfcTag | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'shop' | 'truck' | 'jobsite'>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [createForm, setCreateForm] = useState({
    tag_uid: '',
    tag_type: 'shop' as 'shop' | 'truck' | 'jobsite',
    label: '',
    truck_number: '',
    jobsite_address: '',
  });
  const [editForm, setEditForm] = useState({
    label: '',
    tag_type: 'shop' as 'shop' | 'truck' | 'jobsite',
    truck_number: '',
    jobsite_address: '',
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const isRedirecting = useRef(false);

  const redirectToLogin = useCallback(() => {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    window.location.href = '/login';
  }, []);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'super_admin') {
      router.push('/dashboard');
      return;
    }
    setUser(currentUser);
  }, [router]);

  const getSessionToken = async (): Promise<string | null> => {
    if (isRedirecting.current) return null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) { redirectToLogin(); return null; }
      return data.session.access_token;
    } catch { redirectToLogin(); return null; }
  };

  const fetchTags = useCallback(async () => {
    if (isRedirecting.current) return;
    try {
      setLoading(true);
      const token = await (async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) { redirectToLogin(); return null; }
        return data.session.access_token;
      })();
      if (!token) return;

      const response = await fetch('/api/admin/nfc-tags', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) { redirectToLogin(); return; }

      const result = await response.json();
      if (result.success) {
        setTags(result.data);
      }
    } catch (err) {
      console.error('Error fetching NFC tags:', err);
    } finally {
      setLoading(false);
    }
  }, [redirectToLogin]);

  useEffect(() => {
    if (user) fetchTags();
  }, [user, fetchTags]);

  // ── Create Tag ──────────────────────────────
  const handleCreate = async () => {
    if (!createForm.tag_uid.trim() || !createForm.label.trim()) {
      setError('Tag UID and Label are required');
      return;
    }
    if (createForm.tag_type === 'truck' && !createForm.truck_number.trim()) {
      setError('Truck number is required for truck tags');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const token = await getSessionToken();
      if (!token) return;

      const response = await fetch('/api/admin/nfc-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tag_uid: createForm.tag_uid.trim(),
          tag_type: createForm.tag_type,
          label: createForm.label.trim(),
          truck_number: createForm.tag_type === 'truck' ? createForm.truck_number.trim() : null,
          jobsite_address: createForm.tag_type === 'jobsite' ? createForm.jobsite_address.trim() : null,
        }),
      });

      if (response.status === 401) { redirectToLogin(); return; }

      const result = await response.json();
      if (result.success) {
        setShowCreateModal(false);
        setCreateForm({ tag_uid: '', tag_type: 'shop', label: '', truck_number: '', jobsite_address: '' });
        fetchTags();
      } else {
        setError(result.error || 'Failed to create tag');
      }
    } catch (err) {
      setError('Failed to create tag');
    } finally {
      setSaving(false);
    }
  };

  // ── Update Tag ──────────────────────────────
  const handleUpdate = async () => {
    if (!editingTag) return;
    setSaving(true);
    setError('');
    try {
      const token = await getSessionToken();
      if (!token) return;

      const response = await fetch(`/api/admin/nfc-tags/${editingTag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          label: editForm.label.trim(),
          tag_type: editForm.tag_type,
          truck_number: editForm.tag_type === 'truck' ? editForm.truck_number.trim() : '',
          jobsite_address: editForm.tag_type === 'jobsite' ? editForm.jobsite_address.trim() : '',
          is_active: editForm.is_active,
        }),
      });

      if (response.status === 401) { redirectToLogin(); return; }

      const result = await response.json();
      if (result.success) {
        setShowEditModal(false);
        setEditingTag(null);
        fetchTags();
      } else {
        setError(result.error || 'Failed to update tag');
      }
    } catch (err) {
      setError('Failed to update tag');
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle Active ──────────────────────────────
  const handleToggleActive = async (tag: NfcTag) => {
    try {
      const token = await getSessionToken();
      if (!token) return;

      const response = await fetch(`/api/admin/nfc-tags/${tag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !tag.is_active }),
      });

      if (response.status === 401) { redirectToLogin(); return; }
      if (response.ok) fetchTags();
    } catch (err) {
      console.error('Error toggling tag:', err);
    }
  };

  // ── Delete Tag ──────────────────────────────
  const handleDelete = async (tag: NfcTag) => {
    if (!confirm(`Delete NFC tag "${tag.label}" (${tag.tag_uid})? This cannot be undone.`)) return;
    try {
      const token = await getSessionToken();
      if (!token) return;

      const response = await fetch(`/api/admin/nfc-tags/${tag.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) { redirectToLogin(); return; }
      if (response.ok) fetchTags();
    } catch (err) {
      console.error('Error deleting tag:', err);
    }
  };

  const openEditModal = (tag: NfcTag) => {
    setEditingTag(tag);
    setEditForm({
      label: tag.label,
      tag_type: tag.tag_type,
      truck_number: tag.truck_number || '',
      jobsite_address: tag.jobsite_address || '',
      is_active: tag.is_active,
    });
    setError('');
    setShowEditModal(true);
  };

  // ── Filtering ──────────────────────────────
  const filteredTags = tags.filter(tag => {
    if (filterType !== 'all' && tag.tag_type !== filterType) return false;
    if (filterActive === 'active' && !tag.is_active) return false;
    if (filterActive === 'inactive' && tag.is_active) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        tag.label.toLowerCase().includes(q) ||
        tag.tag_uid.toLowerCase().includes(q) ||
        (tag.truck_number || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const stats = {
    total: tags.length,
    active: tags.filter(t => t.is_active).length,
    inactive: tags.filter(t => !t.is_active).length,
    shop: tags.filter(t => t.tag_type === 'shop').length,
    truck: tags.filter(t => t.tag_type === 'truck').length,
    jobsite: tags.filter(t => t.tag_type === 'jobsite').length,
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-slate-500 text-sm font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/admin"
              className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Admin</span>
            </Link>
            <div className="h-6 w-px bg-slate-200" />
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-sm">
                <Smartphone size={16} className="text-white" />
              </div>
              NFC Management
            </h1>
          </div>

          <button
            onClick={() => { setError(''); setShowCreateModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Register Tag</span>
          </button>
        </div>
      </header>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          {[
            { label: 'Total Tags', value: stats.total, icon: <Tag size={14} />, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
            { label: 'Active', value: stats.active, icon: <Wifi size={14} />, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
            { label: 'Inactive', value: stats.inactive, icon: <WifiOff size={14} />, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
            { label: 'Shop', value: stats.shop, icon: <Factory size={14} />, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
            { label: 'Truck', value: stats.truck, icon: <Truck size={14} />, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
            { label: 'Jobsite', value: stats.jobsite, icon: <MapPin size={14} />, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          ].map(({ label, value, icon, color, bg, border }) => (
            <div key={label} className={`flex items-center gap-3 px-3.5 py-3 rounded-lg border ${border} ${bg}`}>
              <div className={color}>{icon}</div>
              <div>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
                <p className="text-[10px] text-slate-500 font-medium">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by label, UID, or truck number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white text-gray-900 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
            />
          </div>

          <div className="flex gap-1 bg-white rounded-lg p-1 border border-slate-200/60 shadow-sm">
            {(['all', 'shop', 'truck', 'jobsite'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize ${
                  filterType === type
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="flex gap-1 bg-white rounded-lg p-1 border border-slate-200/60 shadow-sm">
            {(['all', 'active', 'inactive'] as const).map(status => (
              <button
                key={status}
                onClick={() => setFilterActive(status)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize ${
                  filterActive === status
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <button
            onClick={fetchTags}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-all"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Tags Table */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Registered NFC Tags</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {filteredTags.length} {filteredTags.length === 1 ? 'tag' : 'tags'}
                {searchQuery && ` matching "${searchQuery}"`}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="p-16 text-center">
              <div className="w-10 h-10 mx-auto mb-3 relative">
                <div className="absolute inset-0 rounded-full border-[3px] border-slate-100"></div>
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-violet-600 animate-spin"></div>
              </div>
              <p className="text-slate-400 text-sm">Loading NFC tags...</p>
            </div>
          ) : filteredTags.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Smartphone className="text-slate-300" size={28} />
              </div>
              <p className="text-slate-600 font-semibold">No NFC tags found</p>
              <p className="text-slate-400 text-sm mt-1">
                {tags.length === 0
                  ? 'Register your first NFC tag to get started'
                  : 'Try adjusting your filters'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Label</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tag UID</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Details</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Last Scanned</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Registered</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredTags.map(tag => {
                    const typeConfig = TAG_TYPE_CONFIG[tag.tag_type];
                    const TypeIcon = typeConfig.icon;
                    return (
                      <tr key={tag.id} className="group hover:bg-violet-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleActive(tag)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                              tag.is_active
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                            }`}
                          >
                            {tag.is_active ? <Wifi size={10} /> : <WifiOff size={10} />}
                            {tag.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-semibold text-slate-800">{tag.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">
                            {tag.tag_uid}
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeConfig.bg} ${typeConfig.color} ${typeConfig.border}`}>
                            <TypeIcon size={10} />
                            {typeConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {tag.tag_type === 'truck' && tag.truck_number ? (
                            <span className="text-xs text-slate-600">Truck #{tag.truck_number}</span>
                          ) : tag.tag_type === 'jobsite' && tag.jobsite_address ? (
                            <span className="text-xs text-slate-600 max-w-[150px] truncate block">{tag.jobsite_address}</span>
                          ) : (
                            <span className="text-xs text-slate-300">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-500">{formatDate(tag.last_scanned_at)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-500">{formatDate(tag.created_at)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditModal(tag)}
                              className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-md transition-all"
                              title="Edit tag"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(tag)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                              title="Delete tag"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Create Modal ─────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-violet-600 to-purple-700 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Plus size={18} />
                Register New NFC Tag
              </h2>
              <p className="text-sm text-violet-200 mt-1">Add a new NFC tag for clock-in verification</p>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <XCircle size={14} />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tag UID *</label>
                <input
                  type="text"
                  placeholder="e.g., 04:A3:2B:1C:5D:6E:7F"
                  value={createForm.tag_uid}
                  onChange={(e) => setCreateForm({ ...createForm, tag_uid: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white text-gray-900 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">The hardware UID printed on the NFC tag or read from a scanner</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Label *</label>
                <input
                  type="text"
                  placeholder="e.g., Shop Front Door, Truck 42, 123 Main St Jobsite"
                  value={createForm.label}
                  onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white text-gray-900 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tag Type *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['shop', 'truck', 'jobsite'] as const).map(type => {
                    const cfg = TAG_TYPE_CONFIG[type];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setCreateForm({ ...createForm, tag_type: type })}
                        className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                          createForm.tag_type === type
                            ? 'border-violet-500 bg-violet-50 text-violet-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <Icon size={16} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {createForm.tag_type === 'truck' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Truck Number *</label>
                  <input
                    type="text"
                    placeholder="e.g., 42"
                    value={createForm.truck_number}
                    onChange={(e) => setCreateForm({ ...createForm, truck_number: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white text-gray-900 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                  />
                </div>
              )}

              {createForm.tag_type === 'jobsite' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Jobsite Address</label>
                  <input
                    type="text"
                    placeholder="e.g., 123 Main St, Greenville SC"
                    value={createForm.jobsite_address}
                    onChange={(e) => setCreateForm({ ...createForm, jobsite_address: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white text-gray-900 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                  />
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white rounded-lg text-sm font-semibold shadow-md transition-all disabled:opacity-50"
              >
                {saving ? (
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <CheckCircle size={15} />
                )}
                Register Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────── */}
      {showEditModal && editingTag && (
        <div className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-700 to-slate-800 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Edit size={18} />
                Edit NFC Tag
              </h2>
              <p className="text-sm text-slate-300 mt-1">
                UID: <code className="font-mono">{editingTag.tag_uid}</code>
              </p>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <XCircle size={14} />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Label</label>
                <input
                  type="text"
                  value={editForm.label}
                  onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white text-gray-900 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tag Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['shop', 'truck', 'jobsite'] as const).map(type => {
                    const cfg = TAG_TYPE_CONFIG[type];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setEditForm({ ...editForm, tag_type: type })}
                        className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                          editForm.tag_type === type
                            ? 'border-violet-500 bg-violet-50 text-violet-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <Icon size={16} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {editForm.tag_type === 'truck' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Truck Number</label>
                  <input
                    type="text"
                    value={editForm.truck_number}
                    onChange={(e) => setEditForm({ ...editForm, truck_number: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white text-gray-900 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                  />
                </div>
              )}

              {editForm.tag_type === 'jobsite' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Jobsite Address</label>
                  <input
                    type="text"
                    value={editForm.jobsite_address}
                    onChange={(e) => setEditForm({ ...editForm, jobsite_address: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white text-gray-900 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-between px-3 py-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Active Status</p>
                  <p className="text-xs text-slate-400">Inactive tags cannot be used for clock-in</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    editForm.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    editForm.is_active ? 'translate-x-5' : ''
                  }`} />
                </button>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowEditModal(false); setEditingTag(null); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white rounded-lg text-sm font-semibold shadow-md transition-all disabled:opacity-50"
              >
                {saving ? (
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <CheckCircle size={15} />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
