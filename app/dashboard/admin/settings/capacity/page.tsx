'use client';

import { useState, useEffect } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Settings,
  Wrench,
  Users,
  AlertTriangle,
  Save,
  CheckCircle,
  XCircle,
  ChevronLeft,
} from 'lucide-react';

interface CapacitySettings {
  skill_wall_saw: number;
  skill_brokk: number;
  skill_precision_dfs: number;
  skill_core_drilling: number;
  skill_slab_sawing: number;
  skill_flat_sawing: number;
  skill_wire_sawing: number;
  max_high_difficulty_jobs: number;
  high_difficulty_threshold: number;
  max_operators_per_job: number;
  min_operators_high_difficulty: number;
  max_slots: number;
  warning_threshold: number;
}

const SKILL_TYPES: { key: keyof CapacitySettings; label: string; description: string }[] = [
  { key: 'skill_wall_saw', label: 'Wall Saw', description: 'Vertical cutting on walls and structures' },
  { key: 'skill_brokk', label: 'Brokk', description: 'Remote-controlled demolition robot' },
  { key: 'skill_precision_dfs', label: 'Precision DFS', description: 'Diamond floor saw precision cuts' },
  { key: 'skill_core_drilling', label: 'Core Drilling', description: 'Circular hole drilling operations' },
  { key: 'skill_slab_sawing', label: 'Slab Sawing', description: 'Horizontal flat slab cuts' },
  { key: 'skill_flat_sawing', label: 'Flat Sawing', description: 'Surface and pavement sawing' },
  { key: 'skill_wire_sawing', label: 'Wire Sawing', description: 'Large mass removal with wire saw' },
];

const ADMIN_ROLES = ['super_admin', 'operations_manager', 'admin'];

export default function CapacitySettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<CapacitySettings>({
    skill_wall_saw: 3,
    skill_brokk: 2,
    skill_precision_dfs: 2,
    skill_core_drilling: 4,
    skill_slab_sawing: 3,
    skill_flat_sawing: 3,
    skill_wire_sawing: 2,
    max_high_difficulty_jobs: 2,
    high_difficulty_threshold: 7,
    max_operators_per_job: 4,
    min_operators_high_difficulty: 2,
    max_slots: 10,
    warning_threshold: 8,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (!ADMIN_ROLES.includes(currentUser.role)) {
      router.push('/dashboard');
      return;
    }
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/capacity-settings', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.success && json.data) {
        setSettings(json.data);
      } else {
        showToast('error', json.error || 'Failed to load settings');
      }
    } catch (err) {
      console.error('Error loading capacity settings:', err);
      showToast('error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/capacity-settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (json.success) {
        setSettings(json.data);
        showToast('success', 'Capacity settings saved successfully');
      } else {
        showToast('error', json.error || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Error saving capacity settings:', err);
      showToast('error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof CapacitySettings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: Math.max(0, value) }));
  };

  const NumInput = ({
    label,
    settingKey,
    min = 0,
    max = 99,
  }: {
    label: string;
    settingKey: keyof CapacitySettings;
    min?: number;
    max?: number;
  }) => (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-700 flex-1">{label}</label>
      <div className="flex items-center gap-1">
        <button
          onClick={() => updateSetting(settingKey, (settings[settingKey] as number) - 1)}
          disabled={(settings[settingKey] as number) <= min}
          className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30 flex items-center justify-center text-lg leading-none transition-colors"
        >
          −
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={settings[settingKey] as number}
          onChange={e => updateSetting(settingKey, parseInt(e.target.value, 10) || 0)}
          className="w-16 text-center bg-white border border-gray-300 rounded text-gray-900 text-sm py-1 focus:outline-none focus:border-purple-500"
        />
        <button
          onClick={() => updateSetting(settingKey, (settings[settingKey] as number) + 1)}
          disabled={(settings[settingKey] as number) >= max}
          className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30 flex items-center justify-center text-lg leading-none transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border transition-all
            ${toast.type === 'success'
              ? 'bg-green-50 border-green-300 text-green-700'
              : 'bg-red-50 border-red-300 text-red-700'
            }`}
        >
          {toast.type === 'success'
            ? <CheckCircle className="w-4 h-4" />
            : <XCircle className="w-4 h-4" />
          }
          <span className="text-sm">{toast.message}</span>
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/dashboard/admin/settings')}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Settings className="w-6 h-6 text-purple-600" />
              Capacity Settings
            </h1>
            <p className="text-gray-600 mt-1 text-sm">
              Configure maximum simultaneous jobs per skill type and crew size constraints
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Section 1: Skill-Based Capacity */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Wrench className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Skill-Based Capacity</h2>
                <p className="text-gray-600 text-sm">Maximum simultaneous jobs that can be scheduled per equipment type</p>
              </div>
            </div>

            <div className="space-y-4">
              {SKILL_TYPES.map(skill => (
                <div key={skill.key} className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900 font-medium text-sm">{skill.label}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{skill.description}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-gray-600 text-xs">Max jobs:</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateSetting(skill.key, (settings[skill.key] as number) - 1)}
                          disabled={(settings[skill.key] as number) <= 0}
                          className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30 flex items-center justify-center text-lg leading-none transition-colors"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={settings[skill.key] as number}
                          onChange={e => updateSetting(skill.key, parseInt(e.target.value, 10) || 0)}
                          className="w-16 text-center bg-white border border-gray-300 rounded text-gray-900 text-sm py-1 focus:outline-none focus:border-purple-500"
                        />
                        <button
                          onClick={() => updateSetting(skill.key, (settings[skill.key] as number) + 1)}
                          disabled={(settings[skill.key] as number) >= 20}
                          className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30 flex items-center justify-center text-lg leading-none transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: High-Priority Job Limit */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">High-Priority Job Limits</h2>
                <p className="text-gray-600 text-sm">Prevent over-scheduling of high-complexity jobs simultaneously</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-4">
                <NumInput
                  label="Difficulty threshold (jobs rated at or above this are 'high-priority')"
                  settingKey="high_difficulty_threshold"
                  min={1}
                  max={10}
                />
                <div className="border-t border-gray-200" />
                <NumInput
                  label={`Maximum simultaneous jobs with difficulty ≥ ${settings.high_difficulty_threshold}`}
                  settingKey="max_high_difficulty_jobs"
                  min={1}
                  max={20}
                />
              </div>
              <p className="text-gray-500 text-xs px-1 mt-2">
                When this limit is reached, new jobs rated {settings.high_difficulty_threshold}+ will be flagged as over-capacity on the schedule board.
              </p>
            </div>
          </div>

          {/* Section 3: Crew Size Limits */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Crew Size Limits</h2>
                <p className="text-gray-600 text-sm">Control operator assignments per job</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-4">
              <NumInput
                label="Maximum operators per job"
                settingKey="max_operators_per_job"
                min={1}
                max={10}
              />
              <div className="border-t border-gray-200" />
              <NumInput
                label={`Minimum operators required for jobs rated ${settings.high_difficulty_threshold}+`}
                settingKey="min_operators_high_difficulty"
                min={1}
                max={10}
              />
            </div>
          </div>

          {/* Section 4: General Capacity (existing) */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Settings className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">General Schedule Capacity</h2>
                <p className="text-gray-600 text-sm">Overall daily schedule limits shown on the schedule board</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-4">
              <NumInput
                label="Maximum total jobs per day"
                settingKey="max_slots"
                min={1}
                max={50}
              />
              <div className="border-t border-gray-200" />
              <NumInput
                label="Warning threshold (show amber indicator above this count)"
                settingKey="warning_threshold"
                min={1}
                max={50}
              />
            </div>
            <p className="text-gray-500 text-xs px-1 mt-2 mt-3">
              The schedule board displays a warning when daily jobs exceed the warning threshold, and blocks new additions at the maximum.
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pb-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
