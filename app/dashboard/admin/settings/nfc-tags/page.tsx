'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Wifi, Plus, Building2, Truck, MapPin, Key,
  Loader2, CheckCircle, Save, X, AlertTriangle, Trash2,
  Info, ExternalLink, Clock, ChevronDown, ChevronUp,
  Copy, Power, PowerOff
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';

interface NfcTag {
  id: string;
  tag_uid: string;
  tag_type: 'shop' | 'truck' | 'jobsite';
  label: string;
  truck_number: string | null;
  jobsite_address: string | null;
  is_active: boolean;
  last_scanned_at: string | null;
  last_scanned_by: string | null;
  created_at: string;
}

const TAG_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  shop:    { label: 'Shop',    icon: <Building2 className="w-4 h-4" />, color: 'text-blue-700',   bg: 'bg-blue-100',   border: 'border-blue-200' },
  truck:   { label: 'Truck',   icon: <Truck className="w-4 h-4" />,     color: 'text-violet-700', bg: 'bg-violet-100', border: 'border-violet-200' },
  jobsite: { label: 'Jobsite', icon: <MapPin className="w-4 h-4" />,    color: 'text-amber-700',  bg: 'bg-amber-100',  border: 'border-amber-200' },
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.pontifexindustries.com';

export default function NfcTagsPage() {
  const router = useRouter();
  const [tags, setTags] = useState<NfcTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showWriteInstructions, setShowWriteInstructions] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const [newTag, setNewTag] = useState({
    tag_uid: '',
    tag_type: 'shop' as 'shop' | 'truck' | 'jobsite',
    label: '',
    truck_number: '',
    jobsite_address: '',
  });

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

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const getToken = async () => {
    const { supabase } = await import('@/lib/supabase');
    const { data: session } = await supabase.auth.getSession();
    return session.session?.access_token || '';
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const token = await getToken();

      const res = await fetch('/api/admin/nfc-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tag_uid: newTag.tag_uid.trim(),
          tag_type: newTag.tag_type,
          label: newTag.label.trim(),
          truck_number: newTag.truck_number.trim() || undefined,
          jobsite_address: newTag.jobsite_address.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        showMessage('success', json.message || 'Tag registered!');
        setNewTag({ tag_uid: '', tag_type: 'shop', label: '', truck_number: '', jobsite_address: '' });
        setShowAddForm(false);
        fetchTags();
      } else {
        showMessage('error', json.error || 'Failed to register tag');
      }
    } catch {
      showMessage('error', 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const toggleTagActive = async (tag: NfcTag) => {
    try {
      const token = await getToken();

      const res = await fetch(`/api/admin/nfc-tags/${tag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !tag.is_active }),
      });

      if (res.ok) {
        fetchTags();
        showMessage('success', `Tag "${tag.label}" ${tag.is_active ? 'deactivated' : 'activated'}`);
      } else {
        showMessage('error', 'Failed to update tag');
      }
    } catch {
      showMessage('error', 'Failed to update tag');
    }
  };

  const handleDeleteTag = async (tag: NfcTag) => {
    setDeletingId(tag.id);
    try {
      const token = await getToken();

      const res = await fetch(`/api/admin/nfc-tags/${tag.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (res.ok) {
        showMessage('success', json.message || `Tag "${tag.label}" deleted`);
        setConfirmDeleteId(null);
        fetchTags();
      } else {
        showMessage('error', json.error || 'Failed to delete tag');
      }
    } catch {
      showMessage('error', 'Failed to delete tag');
    } finally {
      setDeletingId(null);
    }
  };

  const copyToClipboard = async (text: string, uid: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUid(uid);
      setTimeout(() => setCopiedUid(null), 2000);
    } catch {
      // fallback
    }
  };

  const getWriteUrl = (tagUid: string) =>
    `${APP_URL}/dashboard/tools/nfc-scan?tag=${encodeURIComponent(tagUid)}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  const activeTags = tags.filter(t => t.is_active);
  const inactiveTags = tags.filter(t => !t.is_active);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
      {/* Header */}
      <div className="backdrop-blur-xl bg-black/30 border-b border-white/10 sticky top-0 z-30">
        <div className="container mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/admin/settings"
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </Link>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <Wifi className="w-5 h-5 text-emerald-400" />
                  NFC Tag Management
                </h1>
                <p className="text-white/50 text-xs">Register and manage clock-in NFC chips</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg transition-all"
            >
              <Plus className="w-4 h-4" /> Register Chip
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-6 max-w-4xl">
        {/* Messages */}
        {message && (
          <div className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold ${
            message.type === 'success'
              ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/20 border border-red-500/30 text-red-300'
          }`}>
            {message.type === 'success'
              ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
              : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
            {message.text}
          </div>
        )}

        {/* Add Form */}
        {showAddForm && (
          <div className="mb-6 bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Register New NFC Chip</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white/60" />
              </button>
            </div>
            <form onSubmit={handleAddTag} className="space-y-4">
              {/* Tag UID */}
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1.5">NFC Tag UID *</label>
                <input
                  type="text"
                  value={newTag.tag_uid}
                  onChange={(e) => setNewTag(prev => ({ ...prev, tag_uid: e.target.value }))}
                  placeholder="e.g. 04:A3:B2:11:C4:2D:80 or CLK-SHOP-001"
                  required
                  className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-white/30 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <p className="text-[10px] text-white/40 mt-1">
                  Scan the chip with NFC Tools app to read the UID, or type a custom identifier
                </p>
              </div>

              {/* Label + Type row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1.5">Label *</label>
                  <input
                    type="text"
                    value={newTag.label}
                    onChange={(e) => setNewTag(prev => ({ ...prev, label: e.target.value }))}
                    placeholder="e.g. Shop Front Door, Truck #3"
                    required
                    className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-white/30 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1.5">Type *</label>
                  <select
                    value={newTag.tag_type}
                    onChange={(e) => setNewTag(prev => ({ ...prev, tag_type: e.target.value as 'shop' | 'truck' | 'jobsite' }))}
                    className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="shop" className="bg-slate-800">Shop</option>
                    <option value="truck" className="bg-slate-800">Truck</option>
                    <option value="jobsite" className="bg-slate-800">Jobsite</option>
                  </select>
                </div>
              </div>

              {/* Conditional fields */}
              {newTag.tag_type === 'truck' && (
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1.5">Truck Number</label>
                  <input
                    type="text"
                    value={newTag.truck_number}
                    onChange={(e) => setNewTag(prev => ({ ...prev, truck_number: e.target.value }))}
                    placeholder="e.g. 3, T-07, Unit 12"
                    className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-white/30 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              )}
              {newTag.tag_type === 'jobsite' && (
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1.5">Jobsite Address</label>
                  <input
                    type="text"
                    value={newTag.jobsite_address}
                    onChange={(e) => setNewTag(prev => ({ ...prev, jobsite_address: e.target.value }))}
                    placeholder="e.g. 123 Main St, Greenville SC"
                    className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-white/30 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              )}

              {/* Write URL preview */}
              {newTag.tag_uid.trim() && (
                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <p className="text-[10px] font-bold text-purple-300 mb-1">URL to write to chip (for iOS NFC):</p>
                  <p className="text-[10px] text-purple-200 font-mono break-all">
                    {getWriteUrl(newTag.tag_uid.trim())}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Registering...' : 'Register NFC Chip'}
              </button>
            </form>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
            <div className="text-2xl font-bold text-white">{tags.length}</div>
            <div className="text-[10px] font-bold text-white/40 uppercase mt-0.5">Total Chips</div>
          </div>
          <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20 text-center">
            <div className="text-2xl font-bold text-emerald-400">{activeTags.length}</div>
            <div className="text-[10px] font-bold text-emerald-400/70 uppercase mt-0.5">Active</div>
          </div>
          <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20 text-center">
            <div className="text-2xl font-bold text-red-400">{inactiveTags.length}</div>
            <div className="text-[10px] font-bold text-red-400/70 uppercase mt-0.5">Deactivated</div>
          </div>
        </div>

        {/* Tags List */}
        <div className="bg-white/5 backdrop-blur rounded-2xl border border-white/10 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="font-bold text-white">Registered NFC Chips</h2>
            <p className="text-xs text-white/40 mt-0.5">
              {tags.length === 0 ? 'No chips registered yet' : `${tags.length} chip${tags.length !== 1 ? 's' : ''} registered`}
            </p>
          </div>

          {tags.length === 0 ? (
            <div className="p-12 text-center">
              <Wifi className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <p className="font-semibold text-white/50">No NFC chips registered yet</p>
              <p className="text-sm text-white/30 mt-1">Click &quot;Register Chip&quot; to add your first NFC tag</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {tags.map(tag => {
                const typeConfig = TAG_TYPE_CONFIG[tag.tag_type] || TAG_TYPE_CONFIG.shop;
                const writeUrl = getWriteUrl(tag.tag_uid);
                const isShowingWrite = showWriteInstructions === tag.id;
                const isConfirmingDelete = confirmDeleteId === tag.id;

                return (
                  <div key={tag.id} className={`px-6 py-4 transition-colors ${!tag.is_active ? 'opacity-50' : ''}`}>
                    <div className="flex items-start gap-4">
                      {/* Type Icon */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${typeConfig.bg} ${typeConfig.border} border`}>
                        <span className={typeConfig.color}>{typeConfig.icon}</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-white">{tag.label}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${typeConfig.bg} ${typeConfig.color} border ${typeConfig.border}`}>
                            {typeConfig.label}
                          </span>
                          {tag.is_active ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                              Deactivated
                            </span>
                          )}
                        </div>

                        {/* UID */}
                        <div className="flex items-center gap-1.5 mt-1">
                          <Key className="w-3 h-3 text-white/30 flex-shrink-0" />
                          <p className="text-xs text-white/40 font-mono truncate">{tag.tag_uid}</p>
                          <button
                            onClick={() => copyToClipboard(tag.tag_uid, tag.id)}
                            className="p-0.5 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                            title="Copy UID"
                          >
                            {copiedUid === tag.id
                              ? <CheckCircle className="w-3 h-3 text-emerald-400" />
                              : <Copy className="w-3 h-3 text-white/30" />
                            }
                          </button>
                        </div>

                        {/* Extra info */}
                        {tag.truck_number && (
                          <p className="text-xs text-violet-300 mt-0.5 flex items-center gap-1">
                            <Truck className="w-3 h-3" /> Truck #{tag.truck_number}
                          </p>
                        )}
                        {tag.jobsite_address && (
                          <p className="text-xs text-amber-300 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {tag.jobsite_address}
                          </p>
                        )}

                        {/* Last scanned */}
                        {tag.last_scanned_at ? (
                          <p className="text-[10px] text-white/25 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Last scanned: {new Date(tag.last_scanned_at).toLocaleString()}
                          </p>
                        ) : (
                          <p className="text-[10px] text-white/20 mt-1">Never scanned</p>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {/* Write instructions toggle */}
                        <button
                          onClick={() => setShowWriteInstructions(isShowingWrite ? null : tag.id)}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/20 flex items-center gap-1"
                          title="Write URL to chip"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Write
                          {isShowingWrite ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>

                        {/* Toggle active */}
                        <button
                          onClick={() => toggleTagActive(tag)}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1 border ${
                            tag.is_active
                              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border-red-500/20'
                              : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border-emerald-500/20'
                          }`}
                        >
                          {tag.is_active
                            ? <><PowerOff className="w-3 h-3" /> Deactivate</>
                            : <><Power className="w-3 h-3" /> Activate</>
                          }
                        </button>

                        {/* Delete */}
                        {isConfirmingDelete ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDeleteTag(tag)}
                              disabled={deletingId === tag.id}
                              className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center gap-1"
                            >
                              {deletingId === tag.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white/60 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(tag.id)}
                            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 border border-white/10 hover:border-red-500/20 flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Write Instructions (expandable) */}
                    {isShowingWrite && (
                      <div className="mt-4 ml-14 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl space-y-3">
                        <h4 className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5" />
                          How to Write URL to This Chip (iOS NFC / Android)
                        </h4>

                        <div className="space-y-2 text-xs text-white/60">
                          <p><strong className="text-white/80">Step 1:</strong> Download &quot;NFC Tools&quot; app (free, iOS App Store or Google Play)</p>
                          <p><strong className="text-white/80">Step 2:</strong> Open NFC Tools → tap <strong className="text-white/80">Write</strong> → <strong className="text-white/80">Add a record</strong> → <strong className="text-white/80">URL</strong></p>
                          <p><strong className="text-white/80">Step 3:</strong> Paste this URL:</p>
                        </div>

                        <div className="flex items-start gap-2 p-2.5 bg-black/30 rounded-lg border border-white/10">
                          <p className="text-[10px] text-purple-200 font-mono break-all flex-1">{writeUrl}</p>
                          <button
                            onClick={() => copyToClipboard(writeUrl, `url-${tag.id}`)}
                            className="flex-shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
                            title="Copy URL"
                          >
                            {copiedUid === `url-${tag.id}`
                              ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                              : <Copy className="w-3.5 h-3.5 text-white/40" />
                            }
                          </button>
                        </div>

                        <div className="space-y-1 text-xs text-white/60">
                          <p><strong className="text-white/80">Step 4:</strong> Tap <strong className="text-white/80">Write / OK</strong> and hold your phone on the NFC chip until it confirms</p>
                          <p><strong className="text-white/80">Step 5:</strong> Test it — tap the chip with a phone. It should open the Pontifex app and auto-recognize the tag.</p>
                        </div>

                        <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                          <p className="text-[10px] text-amber-300">
                            <strong>Android Web NFC:</strong> Android Chrome reads the chip&apos;s hardware serial number automatically — no need to write a URL. iOS requires the URL approach above.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-white/5 rounded-xl p-5 border border-white/10">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" />
            How NFC Clock-In Works
          </h3>
          <div className="space-y-2.5 text-xs text-white/50">
            <div className="flex gap-2">
              <span className="text-emerald-400 flex-shrink-0 font-bold">Android:</span>
              <p>Chrome reads the chip&apos;s hardware UID via Web NFC API. Operators tap phone → app auto-identifies chip → clocks them in/out instantly. No app install needed.</p>
            </div>
            <div className="flex gap-2">
              <span className="text-blue-400 flex-shrink-0 font-bold">iOS:</span>
              <p>Write a URL to the chip (see &quot;Write&quot; button above). When tapped, iPhone opens the URL which identifies the tag and prompts clock-in/out.</p>
            </div>
            <div className="flex gap-2">
              <span className="text-amber-400 flex-shrink-0 font-bold">Hardware:</span>
              <p>NTAG215 or NTAG216 stickers work great — waterproof, no battery, under $1 each. Stick to shop wall, truck dashboard, or jobsite sign-in box.</p>
            </div>
            <div className="flex gap-2">
              <span className="text-violet-400 flex-shrink-0 font-bold">Out of town:</span>
              <p>Operators who can&apos;t scan an NFC tag use Remote Clock-In (selfie + GPS), which goes to admin for approval.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
