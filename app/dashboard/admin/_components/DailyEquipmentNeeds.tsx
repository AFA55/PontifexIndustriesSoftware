'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Calendar, Wrench, Package, Truck, Clock, User, Loader2,
  ChevronLeft, ChevronRight, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

/**
 * Daily Equipment Needs — read-only morning staging view for shop managers.
 * Pick a date (default today), see each active job and the gear it needs.
 */

interface EquipmentLine {
  label: string;
  source: 'mandatory' | 'needed' | 'selection' | 'special';
  detail?: string;
}
interface EquipmentNeedJob {
  id: string;
  job_number: string | null;
  customer_name: string | null;
  location: string | null;
  arrival_time: string | null;
  operators: string[];
  service_types: { code: string; label: string }[];
  equipment: EquipmentLine[];
}

const SOURCE_CHIP: Record<EquipmentLine['source'], string> = {
  mandatory:
    'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800/50',
  needed:
    'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800/50',
  selection:
    'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-800/50',
  special:
    'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800/50',
};

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function fmtArrival(t: string | null): string {
  if (!t) return 'No time set';
  // arrival_time is HH:MM or HH:MM:SS
  const [hStr, mStr] = t.split(':');
  const h = Number(hStr);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr ?? '00'} ${ampm}`;
}

export default function DailyEquipmentNeeds() {
  const todayIso = new Date().toLocaleDateString('en-CA');
  const [date, setDate] = useState(todayIso);
  const [jobs, setJobs] = useState<EquipmentNeedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNeeds = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError('Session expired. Please log in again.');
        return;
      }
      const res = await fetch(`/api/admin/shop/equipment-needs?date=${d}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to load equipment needs');
      setJobs(j.data?.jobs ?? []);
    } catch (e: any) {
      setError(e.message || 'Failed to load equipment needs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNeeds(date);
  }, [date, fetchNeeds]);

  const niceDate = (() => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  })();

  return (
    <div className="rounded-2xl bg-white/90 dark:bg-slate-800/60 ring-1 ring-slate-200 dark:ring-slate-700 shadow-sm overflow-hidden">
      {/* Header + date controls */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-sky-500/30">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">
                Daily Equipment Needs
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Stage gear for {niceDate}
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchNeeds(date)}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Date picker row */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <label className="relative flex-1 sm:flex-none">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="w-full sm:w-auto min-h-[44px] pl-9 pr-3 rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <button
            onClick={() => setDate(shiftDate(date, 1))}
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
            aria-label="Next day"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          {date !== todayIso && (
            <button
              onClick={() => setDate(todayIso)}
              className="min-h-[44px] px-3 rounded-xl text-sm font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 sm:p-5 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 ring-1 ring-rose-200 dark:ring-rose-800/50 p-4 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Package className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              No jobs scheduled for this day.
            </p>
          </div>
        ) : (
          jobs.map((job) => <JobCard key={job.id} job={job} />)
        )}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: EquipmentNeedJob }) {
  return (
    <div className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 bg-slate-50/60 dark:bg-slate-900/40 overflow-hidden">
      {/* Job header */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {job.job_number || 'Job'}
              {job.customer_name && (
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  {' '}
                  · {job.customer_name}
                </span>
              )}
            </p>
            {job.location && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {job.location}
              </p>
            )}
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 rounded-lg px-2.5 py-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            {fmtArrival(job.arrival_time)}
          </div>
        </div>

        {/* Operator + service types */}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {job.operators.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
              <User className="w-3.5 h-3.5" />
              {job.operators.join(', ')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <User className="w-3.5 h-3.5" />
              Unassigned
            </span>
          )}
          {job.service_types.map((st) => (
            <span
              key={st.code}
              className="text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-700 rounded-md px-1.5 py-0.5"
              title={st.label}
            >
              {st.code}
            </span>
          ))}
        </div>
      </div>

      {/* Equipment list */}
      <div className="p-3.5 sm:p-4">
        {job.equipment.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">
            No specific equipment listed
            {job.service_types.length > 0 && (
              <>
                {' '}— see service types:{' '}
                {job.service_types.map((s) => s.label).join(', ')}
              </>
            )}
            .
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {job.equipment.map((line, i) => (
              <span
                key={`${line.label}-${i}`}
                className={`inline-flex items-center gap-1 text-xs font-medium rounded-lg px-2 py-1 ring-1 ${SOURCE_CHIP[line.source]}`}
                title={line.source === 'mandatory' ? 'Mandatory' : undefined}
              >
                {line.source === 'special' ? (
                  <Truck className="w-3 h-3" />
                ) : (
                  <Package className="w-3 h-3" />
                )}
                {line.label}
                {line.detail && (
                  <span className="font-semibold opacity-90">· {line.detail}</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
