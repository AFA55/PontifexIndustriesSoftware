'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Settings, Save, X, Building2, Clock, DollarSign, ShieldCheck } from 'lucide-react';

interface PayrollSettings {
  pay_frequency: 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly';
  week_start_day: number;
  overtime_threshold_weekly: number;
  overtime_multiplier: number;
  double_time_threshold_daily: number | null;
  double_time_multiplier: number;
  default_per_diem_rate: number;
  per_diem_taxable: boolean;
  auto_lock_days_after_period: number;
  require_timecard_approval: boolean;
  company_name: string;
  company_ein: string;
  company_address: string;
  company_state: string;
}

const DEFAULT_SETTINGS: PayrollSettings = {
  pay_frequency: 'weekly',
  week_start_day: 0,
  overtime_threshold_weekly: 40,
  overtime_multiplier: 1.5,
  double_time_threshold_daily: null,
  double_time_multiplier: 2.0,
  default_per_diem_rate: 0,
  per_diem_taxable: false,
  auto_lock_days_after_period: 7,
  require_timecard_approval: true,
  company_name: '',
  company_ein: '',
  company_address: '',
  company_state: '',
};

export default function PayrollSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PayrollSettings>(DEFAULT_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState<PayrollSettings>(DEFAULT_SETTINGS);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const router = useRouter();

  const checkDirty = useCallback((current: PayrollSettings, original: PayrollSettings) => {
    const dirty = JSON.stringify(current) !== JSON.stringify(original);
    setIsDirty(dirty);
  }, []);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    setUser(currentUser);
    fetchSettings();
  }, [router]);

  // Auto-dismiss success message
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Auto-dismiss error message
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const fetchSettings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/admin/payroll/settings', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const result = await response.json();

      if (result.success && result.data) {
        const fetched: PayrollSettings = {
          pay_frequency: result.data.pay_frequency ?? DEFAULT_SETTINGS.pay_frequency,
          week_start_day: result.data.week_start_day ?? DEFAULT_SETTINGS.week_start_day,
          overtime_threshold_weekly: result.data.overtime_threshold_weekly ?? DEFAULT_SETTINGS.overtime_threshold_weekly,
          overtime_multiplier: result.data.overtime_multiplier ?? DEFAULT_SETTINGS.overtime_multiplier,
          double_time_threshold_daily: result.data.double_time_threshold_daily ?? null,
          double_time_multiplier: result.data.double_time_multiplier ?? DEFAULT_SETTINGS.double_time_multiplier,
          default_per_diem_rate: result.data.default_per_diem_rate ?? DEFAULT_SETTINGS.default_per_diem_rate,
          per_diem_taxable: result.data.per_diem_taxable ?? DEFAULT_SETTINGS.per_diem_taxable,
          auto_lock_days_after_period: result.data.auto_lock_days_after_period ?? DEFAULT_SETTINGS.auto_lock_days_after_period,
          require_timecard_approval: result.data.require_timecard_approval ?? DEFAULT_SETTINGS.require_timecard_approval,
          company_name: result.data.company_name ?? '',
          company_ein: result.data.company_ein ?? '',
          company_address: result.data.company_address ?? '',
          company_state: result.data.company_state ?? '',
        };
        setSettings(fetched);
        setOriginalSettings(fetched);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError('Failed to load payroll settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof PayrollSettings, value: string | number | boolean | null) => {
    const updated = { ...settings, [field]: value };
    setSettings(updated);
    checkDirty(updated, originalSettings);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    // Build payload of only changed fields
    const changedFields: Partial<PayrollSettings> = {};
    for (const key of Object.keys(settings) as (keyof PayrollSettings)[]) {
      if (JSON.stringify(settings[key]) !== JSON.stringify(originalSettings[key])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (changedFields as any)[key] = settings[key];
      }
    }

    if (Object.keys(changedFields).length === 0) {
      setSuccessMsg('No changes to save');
      setSaving(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/admin/payroll/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(changedFields),
      });

      const result = await response.json();

      if (result.success) {
        setOriginalSettings({ ...settings });
        setIsDirty(false);
        setSuccessMsg('Payroll settings saved successfully');
      } else {
        setError(result.error || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save payroll settings');
    } finally {
      setSaving(false);
    }
  };

  const formatPayFrequency = (value: string) => {
    switch (value) {
      case 'weekly': return 'Weekly';
      case 'biweekly': return 'Bi-Weekly';
      case 'semi_monthly': return 'Semi-Monthly';
      case 'monthly': return 'Monthly';
      default: return value;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading payroll settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-white border-b-2 border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/admin/payroll"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-md font-medium"
              >
                <ArrowLeft size={20} />
                <span>Back to Payroll</span>
              </Link>
              <div className="flex items-center gap-2">
                <Settings size={24} className="text-gray-700" />
                <h1 className="text-2xl font-bold text-gray-900">Payroll Settings</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isDirty && (
                <span className="text-sm text-orange-600 font-medium bg-orange-50 px-3 py-1 rounded-lg">
                  Unsaved changes
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Save Settings
                  </>
                )}
              </button>
              <div className="bg-gray-100 px-4 py-2 rounded-xl">
                <p className="text-sm font-bold text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-700 capitalize font-medium">Admin</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Toast Messages */}
        {successMsg && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-6 py-4 rounded-2xl flex items-center justify-between shadow-md">
            <span className="font-medium">{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="text-green-600 hover:text-green-800">
              <X size={18} />
            </button>
          </div>
        )}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-2xl flex items-center justify-between shadow-md">
            <span className="font-medium">{error}</span>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
              <X size={18} />
            </button>
          </div>
        )}

        {/* Section 1: Payroll Rules */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Clock className="text-blue-600" size={20} />
            </div>
            <h2 className="text-lg font-bold text-gray-800">Payroll Rules</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pay Frequency */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Pay Frequency
              </label>
              <select
                value={settings.pay_frequency}
                onChange={(e) => handleChange('pay_frequency', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="weekly">{formatPayFrequency('weekly')}</option>
                <option value="biweekly">{formatPayFrequency('biweekly')}</option>
                <option value="semi_monthly">{formatPayFrequency('semi_monthly')}</option>
                <option value="monthly">{formatPayFrequency('monthly')}</option>
              </select>
            </div>

            {/* Week Start Day */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Week Start Day
              </label>
              <select
                value={settings.week_start_day}
                onChange={(e) => handleChange('week_start_day', parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
            </div>

            {/* Overtime Threshold */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Overtime Threshold (weekly hours)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={settings.overtime_threshold_weekly}
                onChange={(e) => handleChange('overtime_threshold_weekly', parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">Hours per week before overtime kicks in</p>
            </div>

            {/* Overtime Multiplier */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Overtime Multiplier
              </label>
              <input
                type="number"
                min="1"
                step="0.1"
                value={settings.overtime_multiplier}
                onChange={(e) => handleChange('overtime_multiplier', parseFloat(e.target.value) || 1.5)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">Typically 1.5x regular rate</p>
            </div>

            {/* Double Time Threshold */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Double Time Threshold (daily hours)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={settings.double_time_threshold_daily ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  handleChange('double_time_threshold_daily', val === '' ? null : parseFloat(val));
                }}
                placeholder="Leave empty to disable"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">Daily hours before double time. Leave empty if not applicable.</p>
            </div>

            {/* Double Time Multiplier */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Double Time Multiplier
              </label>
              <input
                type="number"
                min="1"
                step="0.1"
                value={settings.double_time_multiplier}
                onChange={(e) => handleChange('double_time_multiplier', parseFloat(e.target.value) || 2.0)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">Typically 2.0x regular rate</p>
            </div>

            {/* Auto Lock Days */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Auto Lock Days After Period
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={settings.auto_lock_days_after_period}
                onChange={(e) => handleChange('auto_lock_days_after_period', parseInt(e.target.value) || 0)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">Days after period end before timecards are locked</p>
            </div>

            {/* Require Timecard Approval */}
            <div className="flex items-center gap-4 pt-6">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.require_timecard_approval}
                  onChange={(e) => handleChange('require_timecard_approval', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-300 peer-focus:ring-4 peer-focus:ring-blue-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
              <div>
                <p className="text-sm font-bold text-gray-700">Require Timecard Approval</p>
                <p className="text-xs text-gray-400">Timecards must be approved before payroll processing</p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Per Diem & Allowances */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <DollarSign className="text-green-600" size={20} />
            </div>
            <h2 className="text-lg font-bold text-gray-800">Per Diem &amp; Allowances</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Default Per Diem Rate */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Default Per Diem Rate ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.default_per_diem_rate}
                  onChange={(e) => handleChange('default_per_diem_rate', parseFloat(e.target.value) || 0)}
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Daily per diem allowance for field operators</p>
            </div>

            {/* Per Diem Taxable */}
            <div className="flex items-center gap-4 pt-6">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.per_diem_taxable}
                  onChange={(e) => handleChange('per_diem_taxable', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-300 peer-focus:ring-4 peer-focus:ring-blue-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
              <div>
                <p className="text-sm font-bold text-gray-700">Per Diem Taxable</p>
                <p className="text-xs text-gray-400">Whether per diem is included as taxable income</p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Company Info */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Building2 className="text-purple-600" size={20} />
            </div>
            <h2 className="text-lg font-bold text-gray-800">Company Information</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Company Name */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Company Name
              </label>
              <input
                type="text"
                value={settings.company_name}
                onChange={(e) => handleChange('company_name', e.target.value)}
                placeholder="Pontifex Industries LLC"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Company EIN */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Company EIN <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={settings.company_ein}
                onChange={(e) => handleChange('company_ein', e.target.value)}
                placeholder="XX-XXXXXXX"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Company Address */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Company Address <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={settings.company_address}
                onChange={(e) => handleChange('company_address', e.target.value)}
                placeholder="123 Main Street, Suite 100, City, State ZIP"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Company State */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Company State
              </label>
              <input
                type="text"
                value={settings.company_state}
                onChange={(e) => handleChange('company_state', e.target.value)}
                placeholder="TX"
                maxLength={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">Two-letter state code (e.g. TX, CA, NY)</p>
            </div>
          </div>
        </div>

        {/* Bottom Save Bar */}
        {isDirty && (
          <div className="sticky bottom-4 bg-white rounded-2xl p-4 shadow-2xl border border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck size={20} className="text-orange-500" />
              <p className="text-sm text-gray-700 font-medium">You have unsaved changes</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSettings({ ...originalSettings });
                  setIsDirty(false);
                }}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Save Settings
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
