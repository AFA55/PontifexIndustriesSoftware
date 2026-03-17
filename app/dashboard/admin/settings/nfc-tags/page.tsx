'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Wifi, Plus, Building2, Key,
  Loader2, CheckCircle, Save, X, AlertTriangle
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';

interface NfcTag {
  id: string;
  tag_uid: string;
  tag_type: string;
  label: string;
  location_description: string | null;
  is_active: boolean;
  last_scanned_at: string | null;
  created_at: string;
}

const TAG_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  shop: { label: 'Shop', icon: <Building2 className="w-4 h-4" />, color: 'text-blue-700', bg: 'bg-blue-100' },
};

export default function NfcTagsPage() {
  const router = useRouter();
  const [tags, setTags] = useState<NfcTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [newTag, setNewTag] = useState({
    tag_uid: '',
    tag_type: 'shop',
    label: '',
    location_description: '',
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const activeTags = tags.filter(t => t.is_active);
  const inactiveTags = tags.filter(t => !t.is_active);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-30 shadow-lg">
        <div className="container mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard/admin/settings" className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all">
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </Link>
              <div>
                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Wifi className="w-5 h-5 text-emerald-600" />
                  NFC Tag Management
                </h1>
                <p className="text-gray-500 text-xs">Register and manage clock-in NFC tags</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg"
            >
              <Plus className="w-4 h-4" /> Register Tag
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-6 max-w-4xl">
        {/* Messages */}
        {message && (
          <div className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold ${
            message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {message.text}
          </div>
        )}

        {/* Add Form */}
        {showAddForm && (
          <div className="mb-6 bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Register New NFC Tag</h2>
              <button onClick={() => setShowAddForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <p className="text-[10px] text-gray-400 mt-1">This is the unique serial number printed on or read from the NFC chip</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Label</label>
                  <input
                    type="text"
                    value={newTag.label}
                    onChange={(e) => setNewTag(prev => ({ ...prev, label: e.target.value }))}
                    placeholder="e.g. Admin Keychain, Shop Wall"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Where is it? <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={newTag.location_description}
                    onChange={(e) => setNewTag(prev => ({ ...prev, location_description: e.target.value }))}
                    placeholder="e.g. On admin keychain, front wall"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Registering...' : 'Register NFC Tag'}
              </button>
            </form>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
            <div className="text-2xl font-bold text-gray-900">{tags.length}</div>
            <div className="text-[10px] font-bold text-gray-500 uppercase">Total Tags</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-green-100 shadow-sm text-center">
            <div className="text-2xl font-bold text-green-700">{activeTags.length}</div>
            <div className="text-[10px] font-bold text-green-500 uppercase">Active</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-red-100 shadow-sm text-center">
            <div className="text-2xl font-bold text-red-700">{inactiveTags.length}</div>
            <div className="text-[10px] font-bold text-red-500 uppercase">Deactivated</div>
          </div>
        </div>

        {/* Tags List */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Registered Tags</h2>
          </div>

          {tags.length === 0 ? (
            <div className="p-12 text-center">
              <Wifi className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="font-semibold text-gray-500">No NFC tags registered yet</p>
              <p className="text-sm text-gray-400 mt-1">Click &quot;Register Tag&quot; to add your first tag</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {tags.map(tag => (
                  <div key={tag.id} className={`px-6 py-4 flex items-center gap-4 ${!tag.is_active ? 'opacity-50' : ''}`}>
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
                      <Key className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900 truncate">{tag.label}</p>
                        {tag.is_active ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                            Deactivated
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 font-mono truncate">{tag.tag_uid}</p>
                      {tag.location_description && <p className="text-xs text-gray-400">{tag.location_description}</p>}
                      {tag.last_scanned_at && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Last scanned: {new Date(tag.last_scanned_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => toggleTagActive(tag)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        tag.is_active
                          ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                          : 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200'
                      }`}
                    >
                      {tag.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 bg-blue-50 rounded-xl p-4 border border-blue-200">
          <h3 className="text-sm font-bold text-blue-900 mb-2">How NFC Clock-In Works</h3>
          <div className="space-y-2 text-xs text-blue-700">
            <p><strong>🔑 Admin Keychain / Shop Wall:</strong> Keep an NFC tag on your keychain or mount one on the shop wall. All operators report to the shop first and scan the tag to clock in.</p>
            <p><strong>📷 Out of Town:</strong> Operators working out of town who can&apos;t scan the NFC tag use the &quot;Remote Clock-In&quot; option — take a selfie + GPS location, which goes to admin for approval.</p>
            <p><strong>💡 Tip:</strong> NTAG215 or NTAG216 stickers work great. They&apos;re waterproof, have no battery, and cost under $1 each. Attach to a keychain fob or stick directly on the wall.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
