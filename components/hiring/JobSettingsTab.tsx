'use client';

/**
 * JobSettingsTab — per-job settings: location / pay / daily budget /
 * channels, manual funnel inputs (until ad accounts are connected),
 * and Close Job with the Hireline-style confirm dialog.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, XOctagon } from 'lucide-react';
import type { HiringJob, AdChannel } from '@/lib/hiring/types';
import { AD_CHANNELS } from '@/lib/hiring/types';
import { Button, Card, Alert, Modal } from '@/components/ui';
import { hiringFetch } from './api';

interface JobSettingsTabProps {
  job: HiringJob;
  onJobUpdate: (job: HiringJob) => void;
}

const INPUT_CLS =
  'w-full rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 ' +
  'px-3.5 py-2.5 min-h-[44px] text-base sm:text-sm text-gray-900 dark:text-white ' +
  'placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand/40';

const CHANNEL_LABELS: Record<AdChannel, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

const PAY_PERIODS: { value: NonNullable<HiringJob['pay_period']>; label: string }[] = [
  { value: 'hour', label: 'per hour' },
  { value: 'day', label: 'per day' },
  { value: 'week', label: 'per week' },
  { value: 'year', label: 'per year' },
  { value: 'project', label: 'per project' },
];

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function JobSettingsTab({ job, onJobUpdate }: JobSettingsTabProps) {
  const router = useRouter();

  const [location, setLocation] = useState(job.location || '');
  const [payMin, setPayMin] = useState(job.pay_min != null ? String(job.pay_min) : '');
  const [payMax, setPayMax] = useState(job.pay_max != null ? String(job.pay_max) : '');
  const [payPeriod, setPayPeriod] = useState<string>(job.pay_period || 'hour');
  const [dailyBudget, setDailyBudget] = useState(job.daily_budget != null ? String(job.daily_budget) : '');
  const [channels, setChannels] = useState<AdChannel[]>(job.channels || []);

  const [impressions, setImpressions] = useState(String(job.impressions ?? 0));
  const [clicks, setClicks] = useState(String(job.clicks ?? 0));
  const [totalSpend, setTotalSpend] = useState(String(job.total_spend ?? 0));

  const [saving, setSaving] = useState(false);
  const [savingFunnel, setSavingFunnel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<'settings' | 'funnel' | null>(null);

  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const toggleChannel = (c: AdChannel) => {
    setChannels((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));
  };

  const patchJob = async (patch: Record<string, unknown>) => {
    const data = await hiringFetch<{ job: HiringJob }>(`/api/hiring/jobs/${job.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    onJobUpdate(data.job);
    return data.job;
  };

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    try {
      await patchJob({
        location: location.trim() || null,
        pay_min: numOrNull(payMin),
        pay_max: numOrNull(payMax),
        pay_period: payPeriod,
        daily_budget: numOrNull(dailyBudget),
        channels,
      });
      setSavedFlash('settings');
      setTimeout(() => setSavedFlash(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const saveFunnel = async () => {
    setSavingFunnel(true);
    setError(null);
    try {
      await patchJob({
        impressions: numOrNull(impressions) ?? 0,
        clicks: numOrNull(clicks) ?? 0,
        total_spend: numOrNull(totalSpend) ?? 0,
      });
      setSavedFlash('funnel');
      setTimeout(() => setSavedFlash(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save funnel numbers');
    } finally {
      setSavingFunnel(false);
    }
  };

  const closeJob = async () => {
    setClosing(true);
    setError(null);
    try {
      await patchJob({ status: 'closed' });
      setCloseOpen(false);
      router.push('/dashboard/hiring');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close job');
      setCloseOpen(false);
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {error && <Alert variant="danger" title="Something went wrong">{error}</Alert>}

      {/* Job settings */}
      <Card title="Job settings">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Bakersfield, CA"
              className={INPUT_CLS}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Pay min ($)</label>
              <input inputMode="decimal" value={payMin} onChange={(e) => setPayMin(e.target.value)} placeholder="18" className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Pay max ($)</label>
              <input inputMode="decimal" value={payMax} onChange={(e) => setPayMax(e.target.value)} placeholder="24" className={INPUT_CLS} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Period</label>
              <select value={payPeriod} onChange={(e) => setPayPeriod(e.target.value)} className={INPUT_CLS}>
                {PAY_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Daily ad budget ($)</label>
            <input inputMode="decimal" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} placeholder="10" className={INPUT_CLS} />
            <p className="mt-1 text-xs text-gray-500 dark:text-white/50">Ads stop for the day when the budget runs out.</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-white/70 mb-1.5">Channels</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {AD_CHANNELS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-white/80 select-none min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={channels.includes(c)}
                    onChange={() => toggleChannel(c)}
                    className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                  />
                  {CHANNEL_LABELS[c]}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button leftIcon={<Save className="w-4 h-4" />} loading={saving} onClick={saveSettings}>
              {savedFlash === 'settings' ? 'Saved!' : 'Save settings'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Manual funnel numbers */}
      <Card
        title="Funnel numbers (manual)"
        subtitle="Until ad accounts are connected, update these from Ads Manager"
      >
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Impressions</label>
            <input inputMode="numeric" value={impressions} onChange={(e) => setImpressions(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Clicks</label>
            <input inputMode="numeric" value={clicks} onChange={(e) => setClicks(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-white/70 mb-1">Total spend ($)</label>
            <input inputMode="decimal" value={totalSpend} onChange={(e) => setTotalSpend(e.target.value)} className={INPUT_CLS} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" leftIcon={<Save className="w-4 h-4" />} loading={savingFunnel} onClick={saveFunnel}>
            {savedFlash === 'funnel' ? 'Saved!' : 'Update numbers'}
          </Button>
        </div>
      </Card>

      {/* Danger zone */}
      {job.status !== 'closed' && (
        <Card className="!border-red-200 dark:!border-red-500/30">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 dark:text-white">Close this job</h3>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-white/60">
                Stops the ad and prevents new applications. Candidates remain accessible.
              </p>
            </div>
            <Button variant="danger" leftIcon={<XOctagon className="w-4 h-4" />} onClick={() => setCloseOpen(true)}>
              Close job
            </Button>
          </div>
        </Card>
      )}

      <Modal
        open={closeOpen}
        onClose={() => !closing && setCloseOpen(false)}
        title="Close this job?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCloseOpen(false)} disabled={closing}>Cancel</Button>
            <Button variant="danger" loading={closing} onClick={closeJob}>Close job</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600 dark:text-white/70">
          Closing this job will stop its ad campaigns and prevent new candidates from applying.
          This can&apos;t be undone — but all of your existing candidates will remain accessible.
        </p>
      </Modal>
    </div>
  );
}
