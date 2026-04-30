'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface EditScheduleModalJob {
  id: string;
  scheduled_date: string | null;
  end_date: string | null;
}

interface EditScheduleModalProps {
  job: EditScheduleModalJob;
  onClose: () => void;
  onSaved: () => void;
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function apiFetch(url: string, opts?: RequestInit) {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...opts?.headers,
    },
  });
}

export default function EditScheduleModal({ job, onClose, onSaved }: EditScheduleModalProps) {
  const [scheduledDate, setScheduledDate] = useState(job.scheduled_date || '');
  const [endDate, setEndDate] = useState(job.end_date || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!scheduledDate) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/jobs/${job.id}/schedule`, {
        method: 'PUT',
        body: JSON.stringify({ scheduled_date: scheduledDate, end_date: endDate || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60">
      <div className="
        w-full max-w-sm p-6 rounded-2xl shadow-2xl
        bg-white
        dark:bg-gradient-to-br dark:from-[#180c2c] dark:to-[#0e0720] dark:border dark:border-white/10
      ">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Edit Schedule</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4 text-slate-500 dark:text-white/60" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-white/80 mb-1">Start Date</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="
                w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500
                bg-white border border-slate-300 text-slate-900
                dark:bg-white/5 dark:border-white/10 dark:text-white dark:[color-scheme:dark]
              "
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-white/80 mb-1">End Date (optional)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={scheduledDate}
              className="
                w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500
                bg-white border border-slate-300 text-slate-900
                dark:bg-white/5 dark:border-white/10 dark:text-white dark:[color-scheme:dark]
              "
            />
          </div>
        </div>

        {error && <p className="text-sm text-rose-600 dark:text-rose-400 mt-3">{error}</p>}

        <div className="flex items-center gap-2 mt-6">
          <button
            onClick={handleSave}
            disabled={saving || !scheduledDate}
            className="
              flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
              text-white bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500
              hover:from-violet-700 hover:via-fuchsia-600 hover:to-pink-600
              disabled:opacity-50 transition-all shadow-sm shadow-violet-500/20
            "
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </button>
          <button
            onClick={onClose}
            className="
              px-4 py-2 text-sm rounded-lg
              text-slate-600 hover:bg-slate-100
              dark:text-white/70 dark:hover:bg-white/10
            "
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
