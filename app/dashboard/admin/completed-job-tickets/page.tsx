'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  FileText,
  Star,
  Clock,
  User,
  MapPin,
  CheckCircle,
  ArrowLeft,
  ChevronRight,
  Search,
  Calendar,
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
  assigned_to: string;
  scheduled_date: string;
  completion_signed_at: string;
  completion_signer_name: string;
  contact_not_on_site: boolean;
  customer_overall_rating: number | null;
  customer_cleanliness_rating: number | null;
  customer_communication_rating: number | null;
  customer_feedback_comments: string | null;
}

export default function CompletedJobTicketsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<CompletedJob[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    checkAuth();
    loadCompletedJobs();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      const userStr = localStorage.getItem('patriot-user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (!['admin', 'super_admin', 'salesman', 'operations_manager'].includes(user.role)) {
          router.push('/dashboard');
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  };

  const loadCompletedJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('job_orders')
        .select('*')
        .eq('status', 'completed')
        .not('completion_signed_at', 'is', null)
        .order('completion_signed_at', { ascending: false });

      if (error && error.message) {
        console.error('Error loading completed jobs:', error);
        throw error;
      }
      setJobs(data || []);
    } catch (error: any) {
      if (error?.message) {
        console.error('Failed to load completed jobs:', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = jobs.filter((job) => {
    const query = searchQuery.toLowerCase();
    return (
      job.customer?.toLowerCase().includes(query) ||
      job.customer_name?.toLowerCase().includes(query) ||
      job.job_location?.toLowerCase().includes(query) ||
      job.location?.toLowerCase().includes(query) ||
      job.job_number?.toLowerCase().includes(query)
    );
  });

  const ratedJobs = jobs.filter((j) => j.customer_overall_rating);
  const avgRating =
    ratedJobs.length > 0
      ? (
          ratedJobs.reduce((sum, j) => sum + (j.customer_overall_rating || 0), 0) /
          ratedJobs.length
        ).toFixed(1)
      : '0.0';
  const noContact = jobs.filter((j) => j.contact_not_on_site).length;
  const highlyRated = jobs.filter(
    (j) => j.customer_overall_rating && j.customer_overall_rating >= 8
  ).length;

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
      <div className="max-w-6xl mx-auto">
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
                Completed Job Tickets
              </h1>
              <p className="text-slate-600 dark:text-white/60 mt-1">
                All completed jobs with customer signatures
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

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'Total Completed',
              value: jobs.length,
              icon: CheckCircle,
              tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
            },
            {
              label: 'Average Rating',
              value: avgRating,
              icon: Star,
              tile: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
            },
            {
              label: 'No Contact On Site',
              value: noContact,
              icon: User,
              tile: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
            },
            {
              label: 'Highly Rated (8+)',
              value: highlyRated,
              icon: Star,
              tile: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="relative overflow-hidden rounded-2xl p-4 bg-white/90 ring-1 ring-slate-200 shadow-sm dark:bg-white/[0.04] dark:ring-white/10"
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

        {/* Search */}
        <div className="mb-6 relative">
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

        {/* Jobs list */}
        {filteredJobs.length === 0 ? (
          <div className="rounded-2xl p-12 text-center shadow-sm bg-white border border-slate-200 dark:bg-white/5 dark:border-white/10">
            <FileText className="w-12 h-12 text-slate-300 dark:text-white/20 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {searchQuery ? 'No jobs found' : 'No Completed Jobs Yet'}
            </h3>
            <p className="text-slate-500 dark:text-white/60 text-sm">
              {searchQuery
                ? 'Try adjusting your search terms'
                : 'Completed jobs with signatures will appear here'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job) => (
              <Link
                key={job.id}
                href={`/dashboard/admin/completed-job-tickets/${job.id}`}
                className="group relative block w-full overflow-hidden rounded-2xl p-4 pt-5 text-left transition-all
                  bg-white/90 ring-1 ring-slate-200 hover:ring-slate-300 shadow-sm hover:shadow-md
                  dark:bg-gradient-to-br dark:from-[#180c2c]/80 dark:to-[#0e0720]/80
                  dark:ring-white/10 dark:hover:ring-white/20 dark:backdrop-blur"
              >
                {/* top accent */}
                <span
                  className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500"
                  aria-hidden
                />
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-mono text-slate-500 dark:text-white/50">
                        {job.job_number}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30">
                        completed
                      </span>
                      {job.contact_not_on_site && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/30">
                          No contact
                        </span>
                      )}
                      {job.customer_overall_rating && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30">
                          <Star className="w-3 h-3 fill-current" />
                          {job.customer_overall_rating}/10
                        </span>
                      )}
                    </div>
                    <h3 className="text-slate-900 dark:text-white font-semibold truncate">
                      {job.customer || job.customer_name}
                    </h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-600 dark:text-white/60 flex-wrap">
                      {(job.job_location || job.location) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {job.job_location || job.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(job.completion_signed_at).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {job.contact_not_on_site
                          ? 'No signature'
                          : job.completion_signer_name || 'N/A'}
                      </span>
                    </div>
                    {job.customer_feedback_comments && (
                      <div className="mt-3 text-xs rounded-lg p-2.5 bg-violet-50 text-slate-700 ring-1 ring-violet-100 dark:bg-violet-500/10 dark:text-white/80 dark:ring-violet-400/20">
                        <span className="font-semibold text-violet-700 dark:text-violet-300">
                          Feedback:{' '}
                        </span>
                        {job.customer_feedback_comments}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 dark:text-white/40 flex-shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
