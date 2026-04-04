'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Wifi, Plus, Building2, Key, Truck, MapPin, User as UserIcon,
  Loader2, CheckCircle, Save, X, AlertTriangle, Smartphone, Search, Shield,
  Power, PowerOff, RefreshCw
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import NfcProgrammer from '@/components/NfcProgrammer';

interface NfcTag {
  id: string;
  tag_uid: string;
  tag_type: string;
  label: string;
  location_description: string | null;
  is_active: boolean;
  last_scanned_at: string | null;
  created_at: string;
  operator_id: string | null;
  pontifex_nfc_id: string | null;
  programmed_at: string | null;
}

interface OperatorProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

const TAG_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; darkColor: string; darkBg: string }> = {
  shop: { label: 'Shop', icon: <Building2 className="w-4 h-4" />, color: 'text-blue-700', bg: 'bg-blue-100', darkColor: 'text-blue-400', darkBg: 'bg-blue-500/10' },
  truck: { label: 'Truck', icon: <Truck className="w-4 h-4" />, color: 'text-orange-700', bg: 'bg-orange-100', darkColor: 'text-orange-400', darkBg: 'bg-orange-500/10' },
  jobsite: { label: 'Jobsite', icon: <MapPin className="w-4 h-4" />, color: 'text-purple-700', bg: 'bg-purple-100', darkColor: 'text-purple-400', darkBg: 'bg-purple-500/10' },
  operator: { label: 'Operator', icon: <UserIcon className="w-4 h-4" />, color: 'text-emerald-700', bg: 'bg-emerald-100', darkColor: 'text-emerald-400', darkBg: 'bg-emerald-500/10' },
};

export default function NfcTagsPage() {
  const router = useRouter();
  const [tags, setTags] = useState<NfcTag[]>([]);
  const [operators, setOperators] = useState<OperatorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState<NfcTag | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Programming modal state
  const [programStep, setProgramStep] = useState<'scan' | 'configure' | 'saving'>('scan');
  const [scannedUid, setScannedUid] = useState('');
  const [existingNdefData, setExistingNdefData] = useState<string | undefined>();
  const [programForm, setProgramForm] = useState({
    label: '',
    tag_type: 'shop' as string,
    operator_id: '' as string,
    pontifex_nfc_id: '',
    write_to_tag: false,
  });

  const [newTag, setNewTag] = useState({
    tag_uid: '',
    tag_type: 'shop',
    label: '',
    location_description: '',
  });

  // Reassign state
  const [reassignOperatorId, setReassignOperatorId] = useState('');

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.push('/login'); return; }
    if (!['super_admin', 'operations_manager', 'admin'].includes(user.role || '')) {
      router.push('/dashboard');
    }
  }, [router]);

  const fetchTags = useCallback(async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';
      const res = await fetch('/api/admin/nfc-tags', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setTags(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch NFC tags:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOperators = useCallback(async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['operator', 'apprentice', 'shop_manager'])
        .order('full_name');
      if (!error && data) setOperators(data);
    } catch (err) {
      console.error('Failed to fetch operators:', err);
    }
  }, []);

  useEffect(() => { fetchTags(); fetchOperators(); }, [fetchTags, fetchOperators]);

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';
      const res = await fetch('/api/admin/nfc-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newTag),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: json.message || 'Tag registered!' });
        setNewTag({ tag_uid: '', tag_type: 'shop', label: '', location_description: '' });
        setShowAddForm(false);
        fetchTags();
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to register tag' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleTagActive = async (tag: NfcTag) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';
      const res = await fetch('/api/admin/nfc-tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: tag.id, is_active: !tag.is_active }),
      });
      if (res.ok) {
        fetchTags();
        setMessage({ type: 'success', text: `Tag "${tag.label}" ${tag.is_active ? 'deactivated' : 'activated'}` });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update tag' });
    }
  };

  const handleReassign = async () => {
    if (!showReassignModal) return;
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';
      const res = await fetch('/api/admin/nfc-tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: showReassignModal.id, operator_id: reassignOperatorId || null }),
      });
      if (res.ok) {
        fetchTags();
        setMessage({ type: 'success', text: `Tag "${showReassignModal.label}" reassigned` });
        setShowReassignModal(null);
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to reassign tag' });
    }
  };

  // ── Program New Tag Modal Logic ──
  const openProgramModal = () => {
    setShowProgramModal(true);
    setProgramStep('scan');
    setScannedUid('');
    setExistingNdefData(undefined);
    const nextNum = tags.length + 1;
    setProgramForm({
      label: '', tag_type: 'shop', operator_id: '',
      pontifex_nfc_id: `PCC-NFC-${String(nextNum).padStart(3, '0')}`,
      write_to_tag: false,
    });
  };

  const handleTagRead = (tagUid: string, existingData?: string) => {
    setScannedUid(tagUid);
    setExistingNdefData(existingData);
    setProgramStep('configure');
  };

  const handleProgramSave = async () => {
    if (!scannedUid || !programForm.label) return;
    setProgramStep('saving');
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';
      const res = await fetch('/api/admin/nfc-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tag_uid: scannedUid,
          tag_type: programForm.tag_type,
          label: programForm.label,
          operator_id: programForm.operator_id || null,
          pontifex_nfc_id: programForm.pontifex_nfc_id || null,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `Tag "${programForm.label}" programmed and registered!` });
        setShowProgramModal(false);
        fetchTags();
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to register tag' });
        setProgramStep('configure');
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
      setProgramStep('configure');
    }
  };

  const getOperatorName = (operatorId: string | null) => {
    if (!operatorId) return null;
    const op = operators.find(o => o.id === operatorId);
    return op ? op.full_name : 'Unknown';
  };

  // Filter tags
  const filteredTags = searchQuery
    ? tags.filter(t =>
        t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.tag_uid.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (getOperatorName(t.operator_id) || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tags;

  const activeTags = tags.filter(t => t.is_active);
  const inactiveTags = tags.filter(t => !t.is_active);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/admin" className="flex items-center gap-2 px-3 py-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all text-sm font-medium">
              <ChevronLeft size={16} />
              <span className="hidden sm:inline">Admin</span>
            </Link>
            <div className="h-6 w-px bg-gray-200" />
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                <Wifi size={16} className="text-white" />
              </div>
              NFC Tag Management
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openProgramModal}
              className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg font-bold text-sm flex items-center gap-2 shadow-md transition-all"
            >
              <Smartphone className="w-4 h-4" /> Program Tag
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg font-bold text-sm flex items-center gap-2 shadow-md transition-all"
            >
              <Plus className="w-4 h-4" /> Register Tag
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-6 py-6">
        {/* Messages */}
        {message && (
          <div className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold ${
            message.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {message.text}
            <button onClick={() => setMessage(null)} className="ml-auto p-0.5 hover:bg-black/5 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Add Form (manual registration) */}
        {showAddForm && (
          <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200/60 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Plus size={16} className="text-emerald-600" />
                Register New NFC Tag
              </h2>
              <button onClick={() => setShowAddForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleAddTag} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">NFC Tag UID</label>
                <input
                  type="text"
                  value={newTag.tag_uid}
                  onChange={(e) => setNewTag(prev => ({ ...prev, tag_uid: e.target.value }))}
                  placeholder="Scan the tag with your phone to read the UID, or type it in"
                  required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
                />
                <p className="text-[10px] text-gray-500 mt-1">The unique serial number printed on or read from the NFC chip</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Label *</label>
                  <input
                    type="text"
                    value={newTag.label}
                    onChange={(e) => setNewTag(prev => ({ ...prev, label: e.target.value }))}
                    placeholder="e.g. Admin Keychain"
                    required
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Type</label>
                  <select
                    value={newTag.tag_type}
                    onChange={(e) => setNewTag(prev => ({ ...prev, tag_type: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
                  >
                    <option value="shop">Shop</option>
                    <option value="truck">Truck</option>
                    <option value="jobsite">Jobsite</option>
                    <option value="operator">Operator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Location <span className="text-gray-500 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={newTag.location_description}
                    onChange={(e) => setNewTag(prev => ({ ...prev, location_description: e.target.value }))}
                    placeholder="e.g. Front wall"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-md transition-all"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Registering...' : 'Register NFC Tag'}
              </button>
            </form>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</span>
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <Wifi size={15} className="text-gray-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{tags.length}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Registered tags</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Power size={15} className="text-emerald-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{activeTags.length}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Ready for scanning</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Inactive</span>
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                <PowerOff size={15} className="text-red-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-red-600">{inactiveTags.length}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Deactivated</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <UserIcon size={15} className="text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-blue-600">{tags.filter(t => t.operator_id).length}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Linked to operators</p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <div className="relative max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search by label, UID, or employee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200/60 rounded-lg text-sm text-gray-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 shadow-sm transition-all"
            />
          </div>
        </div>

        {/* Tags List */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-800 text-sm">Registered Tags</h2>
              <p className="text-xs text-gray-500 mt-0.5">{filteredTags.length} tags</p>
            </div>
            <button onClick={fetchTags} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
              <RefreshCw size={15} className="text-gray-500" />
            </button>
          </div>

          {filteredTags.length === 0 ? (
            <div className="p-12 text-center">
              <Wifi className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="font-semibold text-gray-500">No NFC tags found</p>
              <p className="text-sm text-gray-500 mt-1">
                {searchQuery ? 'Try a different search' : 'Click "Program Tag" or "Register Tag" to add your first tag'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredTags.map(tag => {
                const typeConfig = TAG_TYPE_CONFIG[tag.tag_type] || TAG_TYPE_CONFIG.shop;
                const operatorName = getOperatorName(tag.operator_id);
                return (
                  <div key={tag.id} className={`px-6 py-4 flex items-center gap-4 transition-colors hover:bg-gray-50/60 ${!tag.is_active ? 'opacity-60' : ''}`}>
                    <div className={`w-10 h-10 rounded-xl ${typeConfig.bg} flex items-center justify-center ${typeConfig.color}`}>
                      {typeConfig.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-800 text-sm truncate">{tag.label}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${typeConfig.bg} ${typeConfig.color}`}>
                          {typeConfig.label}
                        </span>
                        {tag.is_active ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">Deactivated</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 font-mono truncate mt-0.5">{tag.tag_uid}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {tag.pontifex_nfc_id && (
                          <p className="text-xs text-indigo-600 font-mono">{tag.pontifex_nfc_id}</p>
                        )}
                        {operatorName && (
                          <p className="text-xs text-emerald-600 flex items-center gap-1">
                            <UserIcon className="w-3 h-3" /> {operatorName}
                          </p>
                        )}
                        {tag.location_description && <p className="text-xs text-gray-500">{tag.location_description}</p>}
                      </div>
                      {tag.last_scanned_at && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          Last scanned: {new Date(tag.last_scanned_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setShowReassignModal(tag); setReassignOperatorId(tag.operator_id || ''); }}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-gray-600 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1"
                      >
                        <RefreshCw size={11} />
                        Reassign
                      </button>
                      <button
                        onClick={() => toggleTagActive(tag)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                          tag.is_active
                            ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {tag.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 bg-blue-50 rounded-xl p-4 border border-blue-200">
          <h3 className="text-sm font-bold text-blue-900 mb-2">How NFC Clock-In Works</h3>
          <div className="space-y-2 text-xs text-blue-700">
            <p><strong>Shop Wall / Admin Keychain:</strong> Operators scan the NFC tag at the shop to clock in each morning.</p>
            <p><strong>Out of Town:</strong> Remote operators use GPS + selfie instead. Goes to admin for approval.</p>
            <p><strong>Tip:</strong> NTAG215 or NTAG216 stickers work great. Waterproof, no battery, under $1 each.</p>
          </div>
        </div>
      </div>

      {/* ═══ Program New Tag Modal ═══ */}
      {showProgramModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-600" />
                Program New Tag
              </h2>
              <button onClick={() => setShowProgramModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6">
              {programStep === 'scan' && (
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Hold an NFC tag near your device to read its UID. On Android Chrome over HTTPS, you can also write data to the tag.
                  </p>
                  <NfcProgrammer
                    onTagRead={handleTagRead}
                    onTagWritten={() => {}}
                    onError={(err) => setMessage({ type: 'error', text: err })}
                  />
                </div>
              )}

              {programStep === 'configure' && (
                <div className="space-y-4">
                  <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-bold text-gray-900">Tag Read Successfully</span>
                    </div>
                    <p className="text-xs text-gray-600">UID: <span className="font-mono font-bold">{scannedUid}</span></p>
                    {existingNdefData && (
                      <p className="text-xs text-gray-500 mt-1">Existing NDEF: <span className="font-mono">{existingNdefData}</span></p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Label *</label>
                    <input
                      type="text"
                      value={programForm.label}
                      onChange={(e) => setProgramForm(prev => ({ ...prev, label: e.target.value }))}
                      placeholder="e.g. Shop Wall Tag, Truck 5 Tag"
                      required
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Tag Type *</label>
                    <select
                      value={programForm.tag_type}
                      onChange={(e) => setProgramForm(prev => ({ ...prev, tag_type: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                    >
                      <option value="shop">Shop</option>
                      <option value="truck">Truck</option>
                      <option value="jobsite">Jobsite</option>
                      <option value="operator">Operator</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Assign to Operator <span className="text-gray-500 font-normal">(optional)</span></label>
                    <select
                      value={programForm.operator_id}
                      onChange={(e) => setProgramForm(prev => ({ ...prev, operator_id: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                    >
                      <option value="">-- No operator --</option>
                      {operators.map(op => (
                        <option key={op.id} value={op.id}>{op.full_name} ({op.role.replace(/_/g, ' ')})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">System NFC ID</label>
                    <input
                      type="text"
                      value={programForm.pontifex_nfc_id}
                      onChange={(e) => setProgramForm(prev => ({ ...prev, pontifex_nfc_id: e.target.value }))}
                      placeholder="PCC-NFC-001"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-mono transition-all"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Auto-generated ID. Can be written to the tag on supported devices.</p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => { setProgramStep('scan'); setScannedUid(''); }}
                      className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-sm transition-all"
                    >
                      Re-scan
                    </button>
                    <button
                      onClick={handleProgramSave}
                      disabled={!programForm.label}
                      className="flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                    >
                      <Save className="w-4 h-4" />
                      Save Tag
                    </button>
                  </div>
                </div>
              )}

              {programStep === 'saving' && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <p className="text-sm font-semibold text-gray-600">Registering tag...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Reassign Modal ═══ */}
      {showReassignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-600" />
                Reassign Tag
              </h2>
              <button onClick={() => setShowReassignModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-gray-500">Tag</p>
                <p className="font-bold text-gray-800">{showReassignModal.label}</p>
                <p className="text-xs text-gray-500 font-mono">{showReassignModal.tag_uid}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Assign to Operator</label>
                <select
                  value={reassignOperatorId}
                  onChange={(e) => setReassignOperatorId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                >
                  <option value="">-- Unassigned --</option>
                  {operators.map(op => (
                    <option key={op.id} value={op.id}>{op.full_name} ({op.role.replace(/_/g, ' ')})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowReassignModal(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-sm transition-all">
                  Cancel
                </button>
                <button onClick={handleReassign} className="flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg font-bold text-sm transition-all">
                  Save Assignment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
