'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DollarSign, Clock, TrendingUp, ArrowLeft, Save, CheckCircle,
  AlertCircle, Loader2, Moon, Coffee, Zap
} from 'lucide-react';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { DEFAULT_PAY_CONFIG, type PayConfig } from '@/lib/pay-calculator';

function hourToLabel(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
}

export default function PayConfigPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<PayConfig>({ ...DEFAULT_PAY_CONFIG });

  // ── Auth guard ──────────────────────────────────────────────
  useEffect(() => {
    const u = getCurrentUser();
    if (!u || !isAdmin()) {
      router.push('/dashboard');
      return;
    }
    setUser(u);
  }, [router]);

  // ── Fetch current config ────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch('/api/admin/pay-config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setConfig({
            overtime_threshold_hours: Number(result.data.overtime_threshold_hours),
            night_shift_start_hour: Number(result.data.night_shift_start_hour),
            night_shift_premium_rate: Number(result.data.night_shift_premium_rate),
            overtime_rate: Number(result.data.overtime_rate),
          });
        }
      }
    } catch (e) {
      console.error('Failed to load pay config:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // ── Save ────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No session');

      const res = await fetch('/api/admin/pay-config', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to save');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message || 'Failed to save pay config');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard/admin/settings"
            className="p-2 bg-white rounded-xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-purple-600" />
              Pay Category Configuration
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Configure overtime thresholds, night shift premiums, and shop time rules
            </p>
          </div>
        </div>

        {/* Cards */}
        <div className="space-y-4">

          {/* Overtime */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Overtime</h2>
                <p className="text-xs text-slate-500">Hours beyond this threshold are paid at the overtime rate</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Weekly hour threshold
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={80}
                    step={0.5}
                    value={config.overtime_threshold_hours}
                    onChange={(e) => setConfig(c => ({ ...c, overtime_threshold_hours: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">hrs</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Default: 40 hrs (FLSA standard)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Overtime rate multiplier
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={3}
                    step={0.05}
                    value={config.overtime_rate}
                    onChange={(e) => setConfig(c => ({ ...c, overtime_rate: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">×</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Default: 1.5× (time-and-a-half)</p>
              </div>
            </div>

            <div className="mt-3 p-3 bg-rose-50 rounded-xl border border-rose-100">
              <p className="text-xs text-rose-700">
                <strong>Current rule:</strong> After {config.overtime_threshold_hours} hours in a week, remaining hours pay at {config.overtime_rate}× base rate. Overtime supersedes night shift premium.
              </p>
            </div>
          </div>

          {/* Night Shift */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Moon className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Night Shift Premium</h2>
                <p className="text-xs text-slate-500">Field work starting at or after this hour earns the premium rate</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Night shift starts at
                </label>
                <select
                  value={config.night_shift_start_hour}
                  onChange={(e) => setConfig(c => ({ ...c, night_shift_start_hour: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{hourToLabel(i)}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Default: 3:00 PM (15:00)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Night shift rate multiplier
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={2}
                    step={0.05}
                    value={config.night_shift_premium_rate}
                    onChange={(e) => setConfig(c => ({ ...c, night_shift_premium_rate: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">×</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Default: 1.15× (15% premium)</p>
              </div>
            </div>

            <div className="mt-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <p className="text-xs text-indigo-700">
                <strong>Current rule:</strong> Field entries with clock-in at or after {hourToLabel(config.night_shift_start_hour)} earn {config.night_shift_premium_rate}× base rate — unless overtime has kicked in.
              </p>
            </div>
          </div>

          {/* Shop Time */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Coffee className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Shop Time</h2>
                <p className="text-xs text-slate-500">Shop entries always pay at regular rate regardless of time of day</p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
              <p className="text-xs text-amber-700">
                <strong>Fixed rule:</strong> Any entry flagged as "Shop Time" (is_shop_time = true) is always classified as <em>regular</em> pay — no night shift premium applies. Overtime still applies if the weekly threshold is exceeded.
              </p>
            </div>
          </div>

          {/* Priority Summary */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-600" />
              Classification Priority
            </h2>
            <ol className="space-y-2">
              {[
                { num: 1, label: 'Shop Time', desc: 'is_shop_time = true → always Regular rate', color: 'bg-amber-100 text-amber-700' },
                { num: 2, label: 'Overtime', desc: `Weekly hours > ${config.overtime_threshold_hours} → ${config.overtime_rate}× rate`, color: 'bg-rose-100 text-rose-700' },
                { num: 3, label: 'Night Shift', desc: `Clock-in ≥ ${hourToLabel(config.night_shift_start_hour)} → ${config.night_shift_premium_rate}× rate`, color: 'bg-indigo-100 text-indigo-700' },
                { num: 4, label: 'Regular', desc: 'All other field work → 1× base rate', color: 'bg-slate-100 text-slate-700' },
              ].map(({ num, label, desc, color }) => (
                <li key={num} className="flex items-start gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${color}`}>
                    {num}
                  </span>
                  <div>
                    <span className="text-sm font-medium text-slate-800">{label}</span>
                    <span className="text-xs text-slate-500 ml-2">{desc}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Error / Saved feedback */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              Pay configuration saved successfully.
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold rounded-2xl transition-colors shadow-sm"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving…' : 'Save Pay Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
