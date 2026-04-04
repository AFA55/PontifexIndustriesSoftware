'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Clock, Save, Loader2, CheckCircle,
  AlertTriangle, Settings, Timer, Coffee, Shield,
  Gauge, Calendar, ToggleLeft, ToggleRight
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';

interface TimecardSettings {
  // Hours & Overtime
  regularHoursPerDay: number;
  dailyOTThreshold: number;
  weeklyOTThreshold: number;
  doubleTimeDaily: number;
  doubleTimeWeekly: number;
  otMultiplier: number;
  doubleTimeMultiplier: number;

  // Rounding & Breaks
  roundToNearest: number; // minutes
  autoDeductBreaks: boolean;
  breakDuration: number; // minutes
  breakAfterHours: number;
  breakIsPaid: boolean;

  // Requirements
  requireNfcClockIn: boolean;
  requireGps: boolean;
  requireAdminApproval: boolean;
  allowRemoteClockIn: boolean;

  // Limits
  maxHoursPerDay: number;
  autoClockOutAfter: number; // hours
  lockTimecardAfterDays: number;

  // Week Configuration
  weekStartDay: string;
}

const DEFAULT_SETTINGS: TimecardSettings = {
  regularHoursPerDay: 8,
  dailyOTThreshold: 8,
  weeklyOTThreshold: 40,
  doubleTimeDaily: 12,
  doubleTimeWeekly: 60,
  otMultiplier: 1.5,
  doubleTimeMultiplier: 2.0,
  roundToNearest: 15,
  autoDeductBreaks: true,
  breakDuration: 30,
  breakAfterHours: 6,
  breakIsPaid: false,
  requireNfcClockIn: false,
  requireGps: true,
  requireAdminApproval: true,
  allowRemoteClockIn: true,
  maxHoursPerDay: 16,
  autoClockOutAfter: 14,
  lockTimecardAfterDays: 7,
  weekStartDay: 'monday',
};

function Toggle({ enabled, onChange, label, description }: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          enabled ? 'bg-blue-600' : 'bg-slate-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function NumberInput({ label, description, value, onChange, unit, min, max, step }: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-800 mb-1">{label}</label>
      {description && <p className="text-xs text-slate-400 mb-2">{description}</p>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step || 1}
          className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all tabular-nums"
        />
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

export default function TimecardSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<TimecardSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.push('/login'); return; }
    if (!['super_admin', 'operations_manager', 'admin'].includes(user.role || '')) {
      router.push('/dashboard');
      return;
    }
    // Load settings from API, fall back to localStorage
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/admin/timecard-settings');
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            const d = json.data;
            setSettings(prev => ({
              ...prev,
              autoDeductBreaks: d.auto_deduct_break ?? prev.autoDeductBreaks,
              breakDuration: d.break_duration_minutes ?? prev.breakDuration,
              breakAfterHours: d.break_threshold_hours ?? prev.breakAfterHours,
              breakIsPaid: d.break_is_paid ?? prev.breakIsPaid,
              requireNfcClockIn: d.require_nfc ?? prev.requireNfcClockIn,
              requireGps: d.require_gps ?? prev.requireGps,
              allowRemoteClockIn: d.allow_remote ?? prev.allowRemoteClockIn,
              weeklyOTThreshold: d.overtime_threshold ?? prev.weeklyOTThreshold,
              autoClockOutAfter: d.auto_clock_out ?? prev.autoClockOutAfter,
            }));
          }
        }
      } catch {
        // Fall back to localStorage
        const stored = localStorage.getItem('timecard-settings');
        if (stored) {
          try { setSettings(s => ({ ...s, ...JSON.parse(stored) })); }
          catch { /* use defaults */ }
        }
      }
      setLoading(false);
    };
    loadSettings();
  }, [router]);

  const updateSetting = <K extends keyof TimecardSettings>(key: K, value: TimecardSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to API
      const res = await fetch('/api/admin/timecard-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto_deduct_break: settings.autoDeductBreaks,
          break_duration_minutes: settings.breakDuration,
          break_threshold_hours: settings.breakAfterHours,
          break_is_paid: settings.breakIsPaid,
          require_nfc: settings.requireNfcClockIn,
          require_gps: settings.requireGps,
          allow_remote: settings.allowRemoteClockIn,
          overtime_threshold: settings.weeklyOTThreshold,
          auto_clock_out: settings.autoClockOutAfter,
        }),
      });
      if (!res.ok) {
        console.error('Failed to save settings to API');
      }
    } catch {
      console.error('Error saving settings');
    }
    // Also persist to localStorage as backup
    localStorage.setItem('timecard-settings', JSON.stringify(settings));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-[900px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/admin"
              className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all text-sm font-medium"
            >
              <ChevronLeft size={16} />
              <span className="hidden sm:inline">Admin</span>
            </Link>
            <div className="h-6 w-px bg-slate-200" />
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-sm">
                <Settings size={16} className="text-white" />
              </div>
              Timecard Settings
            </h1>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-md ${
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'
            } disabled:opacity-50`}
          >
            {saving ? (
              <><Loader2 size={15} className="animate-spin" /> Saving...</>
            ) : saved ? (
              <><CheckCircle size={15} /> Saved!</>
            ) : (
              <><Save size={15} /> Save Settings</>
            )}
          </button>
        </div>
      </header>

      <div className="max-w-[900px] mx-auto px-6 py-8 space-y-6">
        {/* ── Section: Hours & Overtime ────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Clock size={16} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Hours & Overtime</h2>
              <p className="text-xs text-slate-400">Configure overtime thresholds and multipliers</p>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <NumberInput
                label="Regular Hours / Day"
                description="Standard daily work hours"
                value={settings.regularHoursPerDay}
                onChange={(v) => updateSetting('regularHoursPerDay', v)}
                unit="hours"
                min={4}
                max={12}
              />
              <NumberInput
                label="Daily OT Threshold"
                description="Hours after which daily OT kicks in"
                value={settings.dailyOTThreshold}
                onChange={(v) => updateSetting('dailyOTThreshold', v)}
                unit="hours"
                min={4}
                max={16}
              />
              <NumberInput
                label="Weekly OT Threshold"
                description="Hours per week before overtime"
                value={settings.weeklyOTThreshold}
                onChange={(v) => updateSetting('weeklyOTThreshold', v)}
                unit="hours"
                min={20}
                max={60}
              />
              <NumberInput
                label="Double Time (Daily)"
                description="Daily hours before double time"
                value={settings.doubleTimeDaily}
                onChange={(v) => updateSetting('doubleTimeDaily', v)}
                unit="hours"
                min={8}
                max={24}
              />
              <NumberInput
                label="Double Time (Weekly)"
                description="Weekly hours before double time"
                value={settings.doubleTimeWeekly}
                onChange={(v) => updateSetting('doubleTimeWeekly', v)}
                unit="hours"
                min={40}
                max={80}
              />
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Multipliers</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <NumberInput
                  label="OT Multiplier"
                  description="Rate multiplied for overtime hours"
                  value={settings.otMultiplier}
                  onChange={(v) => updateSetting('otMultiplier', v)}
                  unit="x"
                  min={1}
                  max={3}
                  step={0.25}
                />
                <NumberInput
                  label="Double Time Multiplier"
                  description="Rate multiplied for double-time hours"
                  value={settings.doubleTimeMultiplier}
                  onChange={(v) => updateSetting('doubleTimeMultiplier', v)}
                  unit="x"
                  min={1.5}
                  max={4}
                  step={0.25}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Section: Rounding & Breaks ──────────────── */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Coffee size={16} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Rounding & Breaks</h2>
              <p className="text-xs text-slate-400">Time rounding rules and break deductions</p>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">Round to Nearest</label>
              <p className="text-xs text-slate-400 mb-2">Clock-in/out times will be rounded to the nearest interval</p>
              <div className="flex gap-2">
                {[1, 5, 6, 10, 15, 30].map((min) => (
                  <button
                    key={min}
                    onClick={() => updateSetting('roundToNearest', min)}
                    className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                      settings.roundToNearest === min
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {min} min
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <Toggle
                enabled={settings.autoDeductBreaks}
                onChange={(v) => updateSetting('autoDeductBreaks', v)}
                label="Auto-deduct lunch break"
                description="Automatically deduct a lunch break from total hours when shift exceeds a threshold"
              />
            </div>

            {settings.autoDeductBreaks && (
              <div className="space-y-4 pl-4 border-l-2 border-blue-200 bg-blue-50/30 rounded-r-lg py-3 pr-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <NumberInput
                    label="Break duration (minutes)"
                    description="Length of the auto-deducted lunch break"
                    value={settings.breakDuration}
                    onChange={(v) => updateSetting('breakDuration', v)}
                    unit="minutes"
                    min={15}
                    max={60}
                  />
                  <NumberInput
                    label="Deduct after working (hours)"
                    description="Only deduct break if total shift exceeds this many hours"
                    value={settings.breakAfterHours}
                    onChange={(v) => updateSetting('breakAfterHours', v)}
                    unit="hours"
                    min={2}
                    max={10}
                  />
                </div>
                <div className="border-t border-blue-100 pt-3">
                  <Toggle
                    enabled={settings.breakIsPaid}
                    onChange={(v) => updateSetting('breakIsPaid', v)}
                    label="Paid break"
                    description="If enabled, break time counts toward paid hours. If disabled, break time is subtracted from total hours."
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Section: Requirements ──────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Shield size={16} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Requirements</h2>
              <p className="text-xs text-slate-400">Enforce specific clock-in methods and approvals</p>
            </div>
          </div>
          <div className="p-6 divide-y divide-slate-100">
            <Toggle
              enabled={settings.requireNfcClockIn}
              onChange={(v) => updateSetting('requireNfcClockIn', v)}
              label="Require NFC Clock-In"
              description="Operators must scan an NFC tag to clock in. Remote/GPS fallback will need admin approval."
            />
            <Toggle
              enabled={settings.requireGps}
              onChange={(v) => updateSetting('requireGps', v)}
              label="Require GPS Location"
              description="GPS coordinates will be captured at clock-in and clock-out."
            />
            <Toggle
              enabled={settings.requireAdminApproval}
              onChange={(v) => updateSetting('requireAdminApproval', v)}
              label="Require Admin Approval"
              description="All timecard entries must be approved by an admin before being finalized."
            />
            <Toggle
              enabled={settings.allowRemoteClockIn}
              onChange={(v) => updateSetting('allowRemoteClockIn', v)}
              label="Allow Remote Clock-In"
              description="Operators out of town can clock in with a selfie + GPS instead of NFC."
            />
          </div>
        </div>

        {/* ── Section: Limits ───────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <Gauge size={16} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Limits & Safety</h2>
              <p className="text-xs text-slate-400">Prevent excessively long shifts and lock old timecards</p>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <NumberInput
                label="Max Hours / Day"
                description="Warn if daily hours exceed this"
                value={settings.maxHoursPerDay}
                onChange={(v) => updateSetting('maxHoursPerDay', v)}
                unit="hours"
                min={8}
                max={24}
              />
              <NumberInput
                label="Auto Clock-Out After"
                description="Auto clock-out if still active"
                value={settings.autoClockOutAfter}
                onChange={(v) => updateSetting('autoClockOutAfter', v)}
                unit="hours"
                min={8}
                max={24}
              />
              <NumberInput
                label="Lock After"
                description="Days before timecards are locked"
                value={settings.lockTimecardAfterDays}
                onChange={(v) => updateSetting('lockTimecardAfterDays', v)}
                unit="days"
                min={1}
                max={30}
              />
            </div>
          </div>
        </div>

        {/* ── Section: Week Configuration ──────────── */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <Calendar size={16} className="text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Week Configuration</h2>
              <p className="text-xs text-slate-400">Define when the work week starts for overtime calculation</p>
            </div>
          </div>
          <div className="p-6">
            <label className="block text-sm font-semibold text-slate-800 mb-1">Week Start Day</label>
            <p className="text-xs text-slate-400 mb-3">The day overtime calculations reset each week</p>
            <div className="flex flex-wrap gap-2">
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                <button
                  key={day}
                  onClick={() => updateSetting('weekStartDay', day)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                    settings.weekStartDay === day
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-blue-900 mb-1">About These Settings</h3>
              <p className="text-xs text-blue-700">
                Changes apply to all new timecard entries going forward. Existing entries are not retroactively modified.
                Weekend hours (Saturday/Sunday) are always classified as mandatory overtime regardless of the weekly threshold.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom save button */}
        <div className="flex justify-end pb-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-lg ${
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'
            } disabled:opacity-50`}
          >
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> Saving...</>
            ) : saved ? (
              <><CheckCircle size={16} /> Settings Saved!</>
            ) : (
              <><Save size={16} /> Save All Settings</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
