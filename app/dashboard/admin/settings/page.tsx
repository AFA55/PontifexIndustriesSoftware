'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Settings, Calendar, Save, Loader2,
  LayoutGrid, StickyNote, AlertTriangle, CheckCircle,
  Hash, Bell, Minus, Plus, Users
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';

interface ScheduleSettings {
  max_slots: number;
  warning_threshold: number;
  shop_notes_enabled: boolean;
  shop_notes_label: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<ScheduleSettings>({
    max_slots: 10,
    warning_threshold: 8,
    shop_notes_enabled: true,
    shop_notes_label: 'Shop / Notes',
  });
  const [operators, setOperators] = useState<{ id: string; full_name: string; skill_level_numeric: number | null }[]>([]);
  const [skillChanges, setSkillChanges] = useState<Record<string, number | null>>({});
  const [savingSkills, setSavingSkills] = useState(false);
  const [skillsSaved, setSkillsSaved] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Auth guard — super_admin only
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'super_admin' && user.role !== 'operations_manager') {
      router.push('/dashboard');
      return;
    }
    setIsSuperAdmin(user.role === 'super_admin');
  }, [router]);

  // Fetch current settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const res = await fetch('/api/admin/schedule-board/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setSettings(prev => ({
          ...prev,
          max_slots: json.data?.max_slots ?? 10,
          warning_threshold: json.data?.warning_threshold ?? 8,
          shop_notes_enabled: json.data?.shop_notes_enabled ?? true,
          shop_notes_label: json.data?.shop_notes_label ?? 'Shop / Notes',
        }));
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Fetch operator skill levels
  useEffect(() => {
    async function fetchOperatorSkills() {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token || '';

        const res = await fetch('/api/admin/schedule-board/operator-skills', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setOperators(json.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch operator skills:', err);
      }
    }
    fetchOperatorSkills();
  }, []);

  // Save operator skill levels
  const handleSaveSkills = async () => {
    setSavingSkills(true);
    setSkillsSaved(false);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const changedEntries = Object.entries(skillChanges);
      for (const [operatorId, skillLevel] of changedEntries) {
        await fetch('/api/admin/schedule-board/operator-skills', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ operator_id: operatorId, skill_level: skillLevel }),
        });
      }

      // Update local state
      setOperators(prev => prev.map(op => {
        if (skillChanges[op.id] !== undefined) {
          return { ...op, skill_level_numeric: skillChanges[op.id] };
        }
        return op;
      }));
      setSkillChanges({});
      setSkillsSaved(true);
      setTimeout(() => setSkillsSaved(false), 3000);
    } catch {
      setError('Failed to save operator skill levels');
    } finally {
      setSavingSkills(false);
    }
  };

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const res = await fetch('/api/admin/schedule-board/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          max_slots: settings.max_slots,
          warning_threshold: settings.warning_threshold,
          shop_notes_enabled: settings.shop_notes_enabled,
          shop_notes_label: settings.shop_notes_label,
        }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const json = await res.json();
        setError(json.error || 'Failed to save settings');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  };

  const adjustSlots = (delta: number) => {
    setSettings(prev => {
      const newMax = Math.min(50, Math.max(1, prev.max_slots + delta));
      return {
        ...prev,
        max_slots: newMax,
        warning_threshold: Math.min(prev.warning_threshold, newMax),
      };
    });
  };

  const adjustThreshold = (delta: number) => {
    setSettings(prev => ({
      ...prev,
      warning_threshold: Math.min(prev.max_slots, Math.max(1, prev.warning_threshold + delta)),
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-30 shadow-lg">
        <div className="container mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard/admin" className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all hover:scale-105">
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </Link>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-gray-600" />
                  Admin Settings
                </h1>
                <p className="text-gray-500 text-xs">Configure schedule board, capacity, and system preferences</p>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-6 max-w-4xl">
        {/* Success / Error Messages */}
        {saved && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-semibold animate-in slide-in-from-top duration-200">
            <CheckCircle className="w-4 h-4" />
            Settings saved successfully!
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-semibold">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* ══════════════════════════════════════════════
              SCHEDULE BOARD CONFIGURATION
             ══════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Schedule Board Configuration
              </h2>
              <p className="text-purple-200 text-sm mt-0.5">Control how many job slots appear on the daily schedule</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Max Slots */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <LayoutGrid className="w-4 h-4 text-purple-600" />
                    <label className="text-sm font-bold text-gray-900">Available Schedule Spots</label>
                  </div>
                  <p className="text-xs text-gray-500">
                    Number of operator rows on the schedule board. Each spot = one operator assignment for the day.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustSlots(-1)}
                    disabled={settings.max_slots <= 1}
                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-30"
                  >
                    <Minus className="w-4 h-4 text-gray-700" />
                  </button>
                  <div className="w-16 h-12 flex items-center justify-center bg-purple-50 border-2 border-purple-200 rounded-xl">
                    <span className="text-xl font-bold text-purple-700">{settings.max_slots}</span>
                  </div>
                  <button
                    onClick={() => adjustSlots(1)}
                    disabled={settings.max_slots >= 50}
                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-30"
                  >
                    <Plus className="w-4 h-4 text-gray-700" />
                  </button>
                </div>
              </div>

              {/* Visual preview */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Preview — Schedule Rows</div>
                <div className="space-y-1">
                  {Array.from({ length: Math.min(settings.max_slots, 12) }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                        i < settings.warning_threshold
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {i + 1}
                      </div>
                      <div className={`flex-1 h-6 rounded-lg ${
                        i < settings.warning_threshold
                          ? 'bg-purple-50 border border-purple-200'
                          : 'bg-amber-50 border border-amber-200'
                      }`}>
                        <div className="px-2 py-0.5 text-[10px] text-gray-400">
                          {i < settings.warning_threshold ? 'Operator slot' : 'Warning zone'}
                        </div>
                      </div>
                    </div>
                  ))}
                  {settings.max_slots > 12 && (
                    <div className="text-[10px] text-gray-400 text-center py-1">
                      ... +{settings.max_slots - 12} more slots
                    </div>
                  )}
                  {/* Shop / Notes Row */}
                  {settings.shop_notes_enabled && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-300">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-blue-100">
                        <StickyNote className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <div className="flex-1 h-6 rounded-lg bg-blue-50 border border-blue-200 border-dashed">
                        <div className="px-2 py-0.5 text-[10px] text-blue-600 font-semibold">
                          {settings.shop_notes_label}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6" />

              {/* Warning Threshold */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Bell className="w-4 h-4 text-amber-600" />
                    <label className="text-sm font-bold text-gray-900">Capacity Warning Threshold</label>
                  </div>
                  <p className="text-xs text-gray-500">
                    When this many slots are filled, show a warning during job approval. Helps prevent over-scheduling.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustThreshold(-1)}
                    disabled={settings.warning_threshold <= 1}
                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-30"
                  >
                    <Minus className="w-4 h-4 text-gray-700" />
                  </button>
                  <div className="w-16 h-12 flex items-center justify-center bg-amber-50 border-2 border-amber-200 rounded-xl">
                    <span className="text-xl font-bold text-amber-700">{settings.warning_threshold}</span>
                  </div>
                  <button
                    onClick={() => adjustThreshold(1)}
                    disabled={settings.warning_threshold >= settings.max_slots}
                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-30"
                  >
                    <Plus className="w-4 h-4 text-gray-700" />
                  </button>
                </div>
              </div>

              {/* Info callout */}
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  When <strong>{settings.warning_threshold}</strong> of <strong>{settings.max_slots}</strong> slots are filled, the approval modal will show an &ldquo;Approaching Capacity&rdquo; warning. At <strong>{settings.max_slots}/{settings.max_slots}</strong>, approval is blocked.
                </p>
              </div>

              <div className="border-t border-gray-200 pt-6" />

              {/* Shop / Notes Row */}
              <div>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <StickyNote className="w-4 h-4 text-blue-600" />
                      <label className="text-sm font-bold text-gray-900">Shop / Notes Row</label>
                    </div>
                    <p className="text-xs text-gray-500">
                      Extra row at the bottom of the schedule for shop work notes, who&apos;s working in the shop, and general day-of notes.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.shop_notes_enabled}
                      onChange={(e) => setSettings(prev => ({ ...prev, shop_notes_enabled: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                  </label>
                </div>

                {settings.shop_notes_enabled && (
                  <div className="pl-6 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">Row Label</label>
                      <input
                        type="text"
                        value={settings.shop_notes_label}
                        onChange={(e) => setSettings(prev => ({ ...prev, shop_notes_label: e.target.value }))}
                        placeholder="Shop / Notes"
                        className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                      <p className="text-xs text-blue-700">
                        This row appears below all operator slots. Use it for shop assignments, daily notes, or special instructions for the team.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              NFC CLOCK-IN TAGS
             ══════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-cyan-600 to-blue-700 px-6 py-4 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                NFC Clock-In Tags
              </h2>
              <p className="text-cyan-100 text-sm mt-1">Manage NFC tags for operator clock-in verification</p>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                Keep an NFC tag on your keychain or mount one on the shop wall.
                All operators scan it when they arrive. Out-of-town crews use remote clock-in with selfie + GPS.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="text-center p-3 bg-cyan-50 rounded-xl border border-cyan-200">
                  <div className="text-xs font-bold text-cyan-600 uppercase">🔑 NFC Scan</div>
                  <p className="text-[10px] text-cyan-500 mt-1">Keychain or wall tag</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="text-xs font-bold text-amber-600 uppercase">📷 Remote</div>
                  <p className="text-[10px] text-amber-500 mt-1">Selfie + GPS (needs approval)</p>
                </div>
              </div>
              <Link
                href="/dashboard/admin/settings/nfc-tags"
                className="block w-full text-center px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-xl font-bold text-sm transition-all hover:scale-[1.02] shadow-sm"
              >
                Manage NFC Tags →
              </Link>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              OPERATOR SKILL LEVELS (super_admin only)
             ══════════════════════════════════════════════ */}
          {isSuperAdmin && (
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Operator Skill Levels
                </h2>
                <p className="text-emerald-100 text-sm mt-0.5">Set skill levels (1-10) to match operators with job difficulty ratings</p>
              </div>
              <div className="p-6">
                {operators.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No operators found</p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr_auto] gap-3 items-center px-3 pb-2 border-b border-gray-200">
                      <span className="text-xs font-bold text-gray-500 uppercase">Operator</span>
                      <span className="text-xs font-bold text-gray-500 uppercase w-24 text-center">Skill Level</span>
                    </div>
                    {operators.map((op) => {
                      const currentSkill = skillChanges[op.id] !== undefined ? skillChanges[op.id] : op.skill_level_numeric;
                      return (
                        <div key={op.id} className="grid grid-cols-[1fr_auto] gap-3 items-center px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                          <div>
                            <span className="text-sm font-semibold text-gray-900">{op.full_name}</span>
                            {currentSkill !== null && currentSkill !== undefined && (
                              <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                currentSkill >= 7
                                  ? 'bg-green-100 text-green-700'
                                  : currentSkill >= 4
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-red-100 text-red-700'
                              }`}>
                                {currentSkill >= 7 ? 'Expert' : currentSkill >= 4 ? 'Intermediate' : 'Beginner'}
                              </span>
                            )}
                          </div>
                          <select
                            value={currentSkill ?? ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : parseInt(e.target.value);
                              setSkillChanges(prev => ({ ...prev, [op.id]: val }));
                            }}
                            className="w-24 px-3 py-2 border border-gray-300 rounded-xl text-sm text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          >
                            <option value="">--</option>
                            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}

                {Object.keys(skillChanges).length > 0 && (
                  <div className="mt-4 flex items-center justify-between pt-4 border-t border-gray-200">
                    <p className="text-xs text-gray-500">{Object.keys(skillChanges).length} change(s) pending</p>
                    <button
                      onClick={handleSaveSkills}
                      disabled={savingSkills}
                      className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center gap-2"
                    >
                      {savingSkills ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {savingSkills ? 'Saving...' : 'Save Skill Levels'}
                    </button>
                  </div>
                )}

                {skillsSaved && (
                  <div className="mt-3 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-semibold">
                    <CheckCircle className="w-4 h-4" />
                    Operator skill levels saved successfully!
                  </div>
                )}

                <div className="mt-4 bg-emerald-50 rounded-xl p-3 border border-emerald-200">
                  <p className="text-xs text-emerald-700">
                    <strong>How it works:</strong> Each job has a difficulty rating (1-10). When assigning operators, the schedule board will show match quality indicators — green for good matches, yellow for stretch assignments, and red when an operator is under-skilled for the job.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════
              QUICK REFERENCE
             ══════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-600 to-slate-800 px-6 py-4 text-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Hash className="w-5 h-5" />
                Quick Reference
              </h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-purple-50 rounded-xl border border-purple-200">
                  <div className="text-2xl font-bold text-purple-700">{settings.max_slots}</div>
                  <div className="text-[10px] font-bold text-purple-500 uppercase mt-1">Max Daily Slots</div>
                </div>
                <div className="text-center p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="text-2xl font-bold text-amber-700">{settings.warning_threshold}</div>
                  <div className="text-[10px] font-bold text-amber-500 uppercase mt-1">Warning At</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-xl border border-green-200">
                  <div className="text-2xl font-bold text-green-700">{settings.max_slots - settings.warning_threshold}</div>
                  <div className="text-[10px] font-bold text-green-500 uppercase mt-1">Buffer Slots</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-200">
                  <div className="text-2xl font-bold text-blue-700">{settings.shop_notes_enabled ? 'On' : 'Off'}</div>
                  <div className="text-[10px] font-bold text-blue-500 uppercase mt-1">Notes Row</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
