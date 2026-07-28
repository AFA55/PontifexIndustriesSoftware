'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PhotoViewer } from '@/components/PhotoUploader';
import {
  ArrowLeft, Home, Inbox, Loader2, AlertTriangle, MapPin, Calendar,
  UserCog, PenLine, ArrowUpCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

const OFFICE_ROLES = ['super_admin', 'operations_manager', 'admin', 'salesman', 'shop_manager', 'inventory_manager', 'supervisor'];

interface NotReady {
  reason: string;
  photo_urls: string[];
  signer_name: string | null;
  signed_at: string | null;
  reported_at: string | null;
  reported_by_name: string | null;
}
interface PendingJob {
  id: string;
  job_number: string;
  customer_name: string;
  address: string | null;
  location: string | null;
  job_type: string | null;
  scheduled_date: string | null;
  end_date: string | null;
  on_hold_reason: string | null;
  on_hold_placed_at: string | null;
  project_manager_name: string | null;
  not_ready: NotReady | null;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PendingJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<PendingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/pending-jobs', {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const json = await res.json();
      if (res.ok) setJobs(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user) { router.push('/login'); return; }
      if (!OFFICE_ROLES.includes(user.role)) { router.push('/dashboard'); return; }
      fetchJobs();
    })();
  }, [router, fetchJobs]);

  const pushUp = useCallback(async (jobId: string, newDate: string) => {
    setBusyId(jobId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/pending-jobs/${jobId}/reactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ scheduled_date: newDate || undefined }),
      });
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        setExpanded(null);
        setRescheduleDate('');
      }
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0b14]">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
        <div className="container mx-auto px-4 py-4 max-w-3xl flex items-center gap-3">
          <Link href="/dashboard" className="p-2 bg-white/10 rounded-xl border border-white/20 hover:bg-white/20">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <button onClick={() => router.push('/dashboard')} className="p-2 rounded-xl hover:bg-white/10" title="Dashboard">
            <Home className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Pending Jobs</h1>
            <p className="text-amber-100 text-xs">Parked jobs — reschedule and push back onto the board</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 max-w-3xl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 mx-auto bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-3">
              <Inbox className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-base font-bold text-slate-700 dark:text-white/80">No pending jobs</h3>
            <p className="text-sm text-slate-500 dark:text-white/50">Parked or not-ready jobs will show up here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const isOpen = expanded === job.id;
              return (
                <div key={job.id} className="bg-white dark:bg-white/[0.04] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                  <button
                    onClick={() => { setExpanded(isOpen ? null : job.id); setRescheduleDate(job.scheduled_date || ''); }}
                    className="w-full text-left p-4 flex items-start gap-3"
                  >
                    <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-400">#{job.job_number}</span>
                        {job.not_ready && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold border border-red-200">Site not ready</span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{job.customer_name}</h3>
                      <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-white/50 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
                        <span className="truncate">{job.location || job.address || '—'}</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-white/50 mt-1 line-clamp-2">
                        {job.on_hold_reason || job.not_ready?.reason}
                      </p>
                    </div>
                    {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-4 border-t border-slate-100 dark:border-white/5 pt-4">
                      {/* Details */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-xs text-slate-400 uppercase font-semibold">Was scheduled</p><p className="text-slate-800 dark:text-white font-medium">{fmtDate(job.scheduled_date)}</p></div>
                        {job.project_manager_name && (
                          <div><p className="text-xs text-slate-400 uppercase font-semibold">Project Manager</p><p className="text-slate-800 dark:text-white font-medium inline-flex items-center gap-1"><UserCog className="w-3.5 h-3.5" />{job.project_manager_name}</p></div>
                        )}
                      </div>

                      {/* Not-ready report */}
                      {job.not_ready && (
                        <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 space-y-2">
                          <p className="text-xs font-bold text-red-700 dark:text-red-300 uppercase tracking-wide">Not-ready report</p>
                          <p className="text-sm text-slate-800 dark:text-white/90 whitespace-pre-wrap">{job.not_ready.reason}</p>
                          {job.not_ready.photo_urls.length > 0 && (
                            <PhotoViewer photos={job.not_ready.photo_urls} label="Site photos" />
                          )}
                          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-white/50 pt-1">
                            {job.not_ready.signer_name && (
                              <span className="inline-flex items-center gap-1"><PenLine className="w-3.5 h-3.5" /> Signed by {job.not_ready.signer_name}</span>
                            )}
                            {job.not_ready.reported_by_name && <span>· by {job.not_ready.reported_by_name}</span>}
                          </div>
                        </div>
                      )}

                      {/* Reschedule + push up */}
                      <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-3">
                        <label className="block text-xs font-bold text-slate-600 dark:text-white/70 uppercase tracking-wide mb-1.5">
                          <Calendar className="w-3.5 h-3.5 inline mr-1" /> New date (optional)
                        </label>
                        <input
                          type="date"
                          value={rescheduleDate}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white text-sm"
                        />
                        <button
                          onClick={() => pushUp(job.id, rescheduleDate)}
                          disabled={busyId === job.id}
                          className="w-full mt-3 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-emerald-500 to-teal-600 shadow flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {busyId === job.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpCircle className="w-4 h-4" />}
                          Push ticket back up
                        </button>
                      </div>

                      <Link href={`/dashboard/admin/jobs/${job.id}`} className="block text-center text-sm text-brand font-semibold hover:underline">
                        Open full job →
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
