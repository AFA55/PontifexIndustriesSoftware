'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  FileText,
  Clock,
  DollarSign,
  TrendingUp,
  Star,
  MapPin,
  User,
  ArrowLeft,
  Search,
  Download,
  Calendar,
  CheckCircle,
  AlertCircle,
  Trash2,
  Loader2,
} from 'lucide-react';

interface CompletedJob {
  id: string;
  job_number: string;
  customer: string;
  customer_name: string;
  job_location: string;
  location: string;
  address: string;
  description: string;
  scope_of_work: string;
  assigned_to: string;
  scheduled_date: string;
  arrival_time: string;
  shop_arrival_time: string;
  completion_signed_at: string;
  completion_signer_name: string;
  contact_not_on_site: boolean;
  liability_release_signed_by: string;
  liability_release_signed_at: string;
  liability_release_pdf: string | null;
  silica_form_completed_at: string | null;
  silica_form_pdf: string | null;
  agreement_pdf: string | null;
  agreement_pdf_generated_at: string | null;
  customer_overall_rating: number | null;
  customer_cleanliness_rating: number | null;
  customer_communication_rating: number | null;
  customer_feedback_comments: string | null;
}

interface JobDetails {
  job: CompletedJob;
  operatorName: string;
  workPerformed: any[];
  standbyLogs: any[];
  totalStandbyHours: number;
  totalStandbyCost: number;
  totalJobHours: number;
  laborCost: number;
  documents: any[];
}

export default function CompletedJobsArchivePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<CompletedJob[]>([]);
  const [selectedJobDetails, setSelectedJobDetails] = useState<JobDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteJob = async (jobId: string, jobNumber: string) => {
    const confirmed = window.confirm(
      `Permanently delete ${jobNumber}? This removes the job, its scope, progress, completion request, invoice line items, and related history. This cannot be undone.`
    );
    if (!confirmed) return;
    setDeletingId(jobId);
    setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setDeleteError('Not signed in.');
        setDeletingId(null);
        return;
      }
      const res = await fetch(`/api/admin/jobs/${jobId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(json.error || 'Failed to delete job');
        setDeletingId(null);
        return;
      }
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      if (selectedJobDetails?.job.id === jobId) setSelectedJobDetails(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete job');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    checkAuth();
    loadCompletedJobs();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();
    if (!['admin', 'super_admin', 'salesman', 'operations_manager'].includes(profile?.role || '')) {
      router.push('/dashboard');
    }
  };

  const loadCompletedJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('job_orders')
        .select('*')
        .eq('status', 'completed')
        .order('scheduled_date', { ascending: false });

      if (error && error.message) {
        throw error;
      }
      setJobs(data || []);
    } catch (error: any) {
      if (error?.message) {
        console.error('Error loading completed jobs:', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadJobDetails = async (job: CompletedJob) => {
    setLoadingDetails(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoadingDetails(false);
        return;
      }

      let operatorName = 'Unknown';
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', job.assigned_to)
          .single();
        operatorName = profile?.full_name || 'Unknown';
      } catch (_) {}

      let standbyLogs: any[] = [];
      try {
        const { data } = await supabase
          .from('standby_logs')
          .select('*')
          .eq('job_order_id', job.id)
          .eq('status', 'completed');
        standbyLogs = data || [];
      } catch (_) {}

      const totalStandbyHours = standbyLogs.reduce(
        (sum, log) => sum + (log.duration_hours || 0),
        0
      );
      const totalStandbyCost = totalStandbyHours * 189;

      let workPerformed: any[] = [];
      try {
        const { data: workItems } = await supabase
          .from('work_items')
          .select('*')
          .eq('job_order_id', job.id)
          .order('day_number', { ascending: true });
        workPerformed = workItems || [];
      } catch (_) {}

      const startTime = new Date(job.arrival_time || job.scheduled_date);
      const endTime = new Date(job.completion_signed_at);
      const totalJobHours =
        (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      const laborCost = totalJobHours * 75;

      let documents: any[] = [];
      try {
        const { data } = await supabase
          .from('pdf_documents')
          .select('*')
          .eq('job_id', job.id)
          .eq('is_latest', true)
          .order('generated_at', { ascending: false });
        documents = data || [];
      } catch (_) {}

      setSelectedJobDetails({
        job,
        operatorName,
        workPerformed,
        standbyLogs,
        totalStandbyHours,
        totalStandbyCost,
        totalJobHours,
        laborCost,
        documents,
      });
    } catch (err) {
      console.error('Error loading job details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.customer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.job_location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.job_number?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRating =
      filterRating === null ||
      (job.customer_overall_rating && job.customer_overall_rating >= filterRating);
    return matchesSearch && matchesRating;
  });

  const averageRating = (() => {
    const rated = jobs.filter((j) => j.customer_overall_rating);
    if (rated.length === 0) return '0.0';
    return (
      rated.reduce((acc, j) => acc + (j.customer_overall_rating || 0), 0) / rated.length
    ).toFixed(1);
  })();

  const downloadPdf = (base64: string, filename: string) => {
    const blob = new Blob(
      [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
      { type: 'application/pdf' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-white/60 font-medium">
            Loading completed jobs...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/admin"
              className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors dark:bg-white/5 dark:border-white/10 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Completed Jobs Archive
              </h1>
              <p className="text-slate-600 dark:text-white/60 mt-1">
                Analytics, documents, and performance data
              </p>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent tabular-nums">
              {jobs.length}
            </span>
            <span className="text-sm text-slate-500 dark:text-white/60">completed</span>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-2xl p-12 text-center shadow-sm bg-white border border-slate-200 dark:bg-white/5 dark:border-white/10">
            <FileText className="w-12 h-12 text-slate-300 dark:text-white/20 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              No Completed Jobs Yet
            </h3>
            <p className="text-slate-500 dark:text-white/60 text-sm">
              Completed jobs with customer signatures will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                {
                  label: 'Total Jobs Completed',
                  value: jobs.length,
                  icon: FileText,
                  tile: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
                },
                {
                  label: 'Average Rating',
                  value: averageRating,
                  icon: Star,
                  tile: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
                },
                {
                  label: 'Contact Not On Site',
                  value: jobs.filter((j) => j.contact_not_on_site).length,
                  icon: User,
                  tile: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
                },
                {
                  label: 'Highly Rated (8+)',
                  value: jobs.filter(
                    (j) => j.customer_overall_rating && j.customer_overall_rating >= 8
                  ).length,
                  icon: TrendingUp,
                  tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl p-4 bg-white/90 ring-1 ring-slate-200 shadow-sm dark:bg-white/[0.04] dark:ring-white/10"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-500 dark:text-white/60 text-sm font-medium">
                      {stat.label}
                    </span>
                    <span
                      className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${stat.tile}`}
                    >
                      <stat.icon className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <div className="md:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-white/40" />
                <input
                  type="text"
                  placeholder="Search by customer, location, job number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm transition-colors
                    bg-white border border-slate-200 text-slate-900 placeholder-slate-400
                    focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
                    dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/40
                    dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20"
                />
              </div>
              <select
                value={filterRating || ''}
                onChange={(e) =>
                  setFilterRating(e.target.value ? Number(e.target.value) : null)
                }
                className="px-4 py-3 rounded-xl text-sm transition-colors
                  bg-white border border-slate-200 text-slate-900
                  focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
                  dark:bg-white/5 dark:border-white/10 dark:text-white
                  dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20"
              >
                <option value="">All Ratings</option>
                <option value="9">9+ Stars</option>
                <option value="8">8+ Stars</option>
                <option value="7">7+ Stars</option>
                <option value="5">5+ Stars</option>
              </select>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Jobs List */}
              <div className="lg:col-span-1">
                <div className="rounded-2xl p-4 bg-white/90 ring-1 ring-slate-200 shadow-sm dark:bg-white/[0.04] dark:ring-white/10">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 px-1">
                    Jobs ({filteredJobs.length})
                  </h2>
                  <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto pr-1">
                    {filteredJobs.map((job) => {
                      const active = selectedJobDetails?.job.id === job.id;
                      return (
                        <button
                          key={job.id}
                          onClick={() => loadJobDetails(job)}
                          className={`relative w-full text-left p-3 rounded-xl overflow-hidden transition-all
                            ${active
                              ? 'bg-violet-50 ring-2 ring-violet-400 dark:bg-violet-500/15 dark:ring-violet-400/60'
                              : 'bg-white ring-1 ring-slate-200 hover:ring-slate-300 dark:bg-white/[0.03] dark:ring-white/10 dark:hover:ring-white/20'
                            }`}
                        >
                          <span
                            className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400 to-teal-500"
                            aria-hidden
                          />
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                              {job.customer || job.customer_name}
                            </span>
                            {job.contact_not_on_site && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/30 flex-shrink-0">
                                No contact
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-white/50 truncate mb-1.5">
                            {job.job_location || job.location || '—'}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 dark:text-white/50">
                              {new Date(job.completion_signed_at).toLocaleDateString()}
                            </span>
                            {job.customer_overall_rating && (
                              <span className="px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1 bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30">
                                <Star className="w-3 h-3 fill-current" />
                                {job.customer_overall_rating}/10
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {filteredJobs.length === 0 && (
                      <div className="text-center py-8 text-slate-500 dark:text-white/50 text-sm">
                        No completed jobs found
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="lg:col-span-2">
                {loadingDetails ? (
                  <div className="rounded-2xl p-12 text-center shadow-sm bg-white border border-slate-200 dark:bg-white/5 dark:border-white/10">
                    <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </div>
                ) : selectedJobDetails ? (
                  <div className="space-y-6">
                    {/* Overview */}
                    <div className="relative overflow-hidden rounded-2xl p-6 bg-white/90 ring-1 ring-slate-200 shadow-sm dark:bg-white/[0.04] dark:ring-white/10">
                      <span
                        className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500"
                        aria-hidden
                      />
                      <div className="flex items-center justify-between mb-4 gap-3">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                          Job Details
                        </h2>
                        <button
                          onClick={() =>
                            handleDeleteJob(
                              selectedJobDetails.job.id,
                              selectedJobDetails.job.job_number
                            )
                          }
                          disabled={deletingId === selectedJobDetails.job.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Permanently delete this job"
                        >
                          {deletingId === selectedJobDetails.job.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          {deletingId === selectedJobDetails.job.id ? 'Deleting…' : 'Delete Job'}
                        </button>
                      </div>
                      {deleteError && (
                        <div className="mb-3 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30">
                          {deleteError}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        {[
                          ['Job Number', selectedJobDetails.job.job_number],
                          [
                            'Customer',
                            selectedJobDetails.job.customer ||
                              selectedJobDetails.job.customer_name,
                          ],
                          [
                            'Location',
                            selectedJobDetails.job.job_location ||
                              selectedJobDetails.job.location,
                          ],
                          ['Operator', selectedJobDetails.operatorName],
                          [
                            'Scheduled Date',
                            new Date(
                              selectedJobDetails.job.scheduled_date
                            ).toLocaleDateString(),
                          ],
                          [
                            'Completion Date',
                            new Date(
                              selectedJobDetails.job.completion_signed_at
                            ).toLocaleString(),
                          ],
                        ].map(([label, value]) => (
                          <div key={label as string}>
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50 mb-1">
                              {label}
                            </p>
                            <p className="text-sm text-slate-900 dark:text-white">
                              {value || '—'}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Metrics */}
                      <div className="grid grid-cols-3 gap-3 mb-6">
                        {[
                          {
                            icon: Clock,
                            label: 'Total Time',
                            value: `${selectedJobDetails.totalJobHours.toFixed(1)}h`,
                            tile: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/30',
                          },
                          {
                            icon: Clock,
                            label: 'Standby Time',
                            value: `${selectedJobDetails.totalStandbyHours.toFixed(1)}h`,
                            tile: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
                          },
                          {
                            icon: DollarSign,
                            label: 'Labor Cost',
                            value: `$${selectedJobDetails.laborCost.toFixed(0)}`,
                            tile: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
                          },
                        ].map((m) => (
                          <div
                            key={m.label}
                            className={`rounded-xl p-4 ring-1 ${m.tile}`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <m.icon className="w-4 h-4" />
                              <span className="text-xs font-semibold">{m.label}</span>
                            </div>
                            <p className="text-2xl font-bold tabular-nums">{m.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Scope */}
                      <div className="rounded-xl p-4 bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10 mb-6">
                        <h3 className="font-bold text-slate-900 dark:text-white mb-3 text-sm">
                          Original Scope vs Work Performed
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-white/50 mb-1">
                              Original Description
                            </p>
                            <p className="text-sm text-slate-700 dark:text-white/80">
                              {selectedJobDetails.job.description ||
                                selectedJobDetails.job.scope_of_work ||
                                'No description'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-white/50 mb-1">
                              Work Performed
                            </p>
                            {selectedJobDetails.workPerformed.length > 0 ? (
                              <ul className="text-sm text-slate-700 dark:text-white/80 space-y-1">
                                {selectedJobDetails.workPerformed.map((item, idx) => (
                                  <li key={idx} className="flex items-start gap-2">
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                                    <span>
                                      {item.name}{' '}
                                      {item.quantity > 1 ? `(x${item.quantity})` : ''}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm italic text-slate-500 dark:text-white/50">
                                No detailed work log available
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Ratings */}
                      {(selectedJobDetails.job.customer_overall_rating ||
                        selectedJobDetails.job.customer_cleanliness_rating ||
                        selectedJobDetails.job.customer_communication_rating) && (
                        <div className="rounded-xl p-5 ring-1 bg-gradient-to-br from-emerald-50 to-sky-50 ring-emerald-200 dark:from-emerald-500/10 dark:to-sky-500/10 dark:ring-emerald-400/30">
                          <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2 text-sm">
                            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                            Customer Feedback
                          </h3>
                          <div className="grid grid-cols-3 gap-4 mb-3">
                            {selectedJobDetails.job.customer_overall_rating && (
                              <div className="text-center">
                                <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-300 tabular-nums">
                                  {selectedJobDetails.job.customer_overall_rating}/10
                                </div>
                                <div className="text-xs text-slate-600 dark:text-white/60">
                                  Overall
                                </div>
                              </div>
                            )}
                            {selectedJobDetails.job.customer_cleanliness_rating && (
                              <div className="text-center">
                                <div className="text-3xl font-bold text-sky-600 dark:text-sky-300 tabular-nums">
                                  {selectedJobDetails.job.customer_cleanliness_rating}/10
                                </div>
                                <div className="text-xs text-slate-600 dark:text-white/60">
                                  Cleanliness
                                </div>
                              </div>
                            )}
                            {selectedJobDetails.job.customer_communication_rating && (
                              <div className="text-center">
                                <div className="text-3xl font-bold text-violet-600 dark:text-violet-300 tabular-nums">
                                  {
                                    selectedJobDetails.job
                                      .customer_communication_rating
                                  }
                                  /10
                                </div>
                                <div className="text-xs text-slate-600 dark:text-white/60">
                                  Communication
                                </div>
                              </div>
                            )}
                          </div>
                          {selectedJobDetails.job.customer_feedback_comments && (
                            <div className="text-sm p-3 rounded-lg bg-white/80 text-slate-700 dark:bg-white/5 dark:text-white/80">
                              <strong>Comments: </strong>
                              {selectedJobDetails.job.customer_feedback_comments}
                            </div>
                          )}
                          <div className="mt-3 text-xs text-slate-600 dark:text-white/60 flex items-center gap-1">
                            {selectedJobDetails.job.contact_not_on_site ? (
                              <>
                                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                                No customer signature — contact not available on site
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                Signed by:{' '}
                                {selectedJobDetails.job.completion_signer_name ||
                                  'Unknown'}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Documents */}
                    <div className="rounded-2xl p-6 bg-white/90 ring-1 ring-slate-200 shadow-sm dark:bg-white/[0.04] dark:ring-white/10">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-violet-600 dark:text-violet-300" />
                        Job Documents &amp; Attachments
                      </h2>
                      <div className="space-y-3">
                        {selectedJobDetails.job.agreement_pdf && (
                          <DocRow
                            title="Work Order Agreement"
                            subtitle="Signed at start of job — Terms & conditions accepted"
                            date={
                              selectedJobDetails.job.agreement_pdf_generated_at ||
                              'Generated with job'
                            }
                            hue="orange"
                            onDownload={() =>
                              downloadPdf(
                                selectedJobDetails.job.agreement_pdf!,
                                `WorkOrderAgreement_${selectedJobDetails.job.job_number}.pdf`
                              )
                            }
                          />
                        )}
                        {selectedJobDetails.job.liability_release_signed_at &&
                          selectedJobDetails.job.liability_release_pdf && (
                            <DocRow
                              title="Liability Release & Indemnification"
                              subtitle={`Signed by: ${selectedJobDetails.job.liability_release_signed_by}`}
                              date={selectedJobDetails.job.liability_release_signed_at}
                              hue="rose"
                              onDownload={() =>
                                downloadPdf(
                                  selectedJobDetails.job.liability_release_pdf!,
                                  `LiabilityRelease_${selectedJobDetails.job.job_number}.pdf`
                                )
                              }
                            />
                          )}
                        {selectedJobDetails.job.silica_form_completed_at &&
                          selectedJobDetails.job.silica_form_pdf && (
                            <DocRow
                              title="Silica Dust/Exposure Control Plan"
                              subtitle="OSHA compliant silica exposure documentation"
                              date={selectedJobDetails.job.silica_form_completed_at}
                              hue="sky"
                              onDownload={() =>
                                downloadPdf(
                                  selectedJobDetails.job.silica_form_pdf!,
                                  `SilicaForm_${selectedJobDetails.job.job_number}.pdf`
                                )
                              }
                            />
                          )}
                        {selectedJobDetails.job.completion_signed_at &&
                          !selectedJobDetails.job.contact_not_on_site && (
                            <div className="rounded-xl p-4 bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-400/30 flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-300 mt-0.5" />
                                <div>
                                  <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                                    Service Completion Signature
                                  </p>
                                  <p className="text-sm text-emerald-700 dark:text-emerald-300/80">
                                    Signed by:{' '}
                                    {selectedJobDetails.job.completion_signer_name}
                                  </p>
                                  <p className="text-xs text-emerald-600 dark:text-emerald-300/60">
                                    {new Date(
                                      selectedJobDetails.job.completion_signed_at
                                    ).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-400/30 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Signed
                              </span>
                            </div>
                          )}

                        {!selectedJobDetails.job.agreement_pdf &&
                          !selectedJobDetails.job.liability_release_pdf &&
                          !selectedJobDetails.job.silica_form_pdf &&
                          !selectedJobDetails.job.completion_signed_at && (
                            <div className="rounded-xl p-6 text-center bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
                              <FileText className="w-10 h-10 text-slate-300 dark:text-white/20 mx-auto mb-2" />
                              <p className="text-slate-600 dark:text-white/70 font-medium text-sm">
                                No documents available for this job
                              </p>
                              <p className="text-xs text-slate-500 dark:text-white/50 mt-1">
                                Documents are generated during job workflow completion
                              </p>
                            </div>
                          )}

                        {selectedJobDetails.documents.length > 0 && (
                          <>
                            <div className="border-t border-slate-200 dark:border-white/10 my-4 pt-4">
                              <h3 className="text-sm font-bold text-slate-700 dark:text-white/80 mb-2">
                                Additional Storage Documents
                              </h3>
                            </div>
                            {selectedJobDetails.documents.map((doc) => (
                              <div
                                key={doc.id}
                                className="rounded-xl p-4 bg-violet-50 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/30 flex items-start justify-between gap-3"
                              >
                                <div className="flex items-start gap-3">
                                  <FileText className="w-5 h-5 text-violet-600 dark:text-violet-300 mt-0.5" />
                                  <div>
                                    <p className="font-semibold text-violet-900 dark:text-violet-200">
                                      {doc.document_name}
                                    </p>
                                    <p className="text-xs text-violet-600 dark:text-violet-300/70">
                                      Generated:{' '}
                                      {new Date(doc.generated_at).toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                                <a
                                  href={doc.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors flex-shrink-0"
                                >
                                  View
                                </a>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl p-12 text-center shadow-sm bg-white border border-slate-200 dark:bg-white/5 dark:border-white/10">
                    <FileText className="w-12 h-12 text-slate-300 dark:text-white/20 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                      Select a Job
                    </h3>
                    <p className="text-slate-500 dark:text-white/60 text-sm">
                      Click on a job from the list to view detailed analytics and
                      documents
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DocRow({
  title,
  subtitle,
  date,
  hue,
  onDownload,
}: {
  title: string;
  subtitle: string;
  date: string;
  hue: 'orange' | 'rose' | 'sky';
  onDownload: () => void;
}) {
  const hueMap = {
    orange:
      'bg-orange-50 ring-orange-200 dark:bg-orange-500/10 dark:ring-orange-400/30',
    rose: 'bg-rose-50 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-400/30',
    sky: 'bg-sky-50 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-400/30',
  };
  const textMap = {
    orange: 'text-orange-600 dark:text-orange-300',
    rose: 'text-rose-600 dark:text-rose-300',
    sky: 'text-sky-600 dark:text-sky-300',
  };
  const titleMap = {
    orange: 'text-orange-900 dark:text-orange-200',
    rose: 'text-rose-900 dark:text-rose-200',
    sky: 'text-sky-900 dark:text-sky-200',
  };
  const btnMap = {
    orange: 'bg-orange-600 hover:bg-orange-700',
    rose: 'bg-rose-600 hover:bg-rose-700',
    sky: 'bg-sky-600 hover:bg-sky-700',
  };
  return (
    <div
      className={`rounded-xl p-4 ring-1 flex items-start justify-between gap-3 ${hueMap[hue]}`}
    >
      <div className="flex items-start gap-3">
        <FileText className={`w-5 h-5 mt-0.5 ${textMap[hue]}`} />
        <div>
          <p className={`font-semibold ${titleMap[hue]}`}>{title}</p>
          <p className={`text-sm ${textMap[hue]}`}>{subtitle}</p>
          <p className={`text-xs ${textMap[hue]} opacity-80`}>
            {typeof date === 'string' && !isNaN(Date.parse(date))
              ? new Date(date).toLocaleString()
              : date}
          </p>
        </div>
      </div>
      <button
        onClick={onDownload}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors flex items-center gap-1 flex-shrink-0 ${btnMap[hue]}`}
      >
        <Download className="w-3.5 h-3.5" />
        Download
      </button>
    </div>
  );
}
