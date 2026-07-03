'use client';

export const dynamic = 'force-dynamic';

/**
 * Job Board — hiring jobs list (Hireline-style). Open/Closed tabs, funnel
 * columns, status pills, language-variant badges. Table on desktop,
 * cards at <md. Role gate: HIRING_ADMIN_ROLES.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Megaphone, Lock, MapPin, Users, ChevronRight } from 'lucide-react';
import { getCurrentUser, type User } from '@/lib/auth';
import type { HiringJob } from '@/lib/hiring/types';
import { HIRING_ADMIN_ROLES } from '@/lib/hiring/types';
import { Button, Card, EmptyState, PageHeader, Spinner, Alert } from '@/components/ui';
import {
  hiringFetch, HiringApiError, JOB_STATUS_PILL, fmtInt, clickRate, fmtDateShort,
} from '@/components/hiring/api';

/** The list API may include a per-job candidate count (not in the base row shape). */
type JobRow = HiringJob & { candidate_count?: number };

function StatusPill({ status }: { status: HiringJob['status'] }) {
  const pill = JOB_STATUS_PILL[status] ?? JOB_STATUS_PILL.draft;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${pill.className}`}>
      {pill.label}
    </span>
  );
}

function LanguageBadge({ language }: { language: string }) {
  if (!language || language === 'en') return null;
  return (
    <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand">
      {language}
    </span>
  );
}

export default function HiringJobsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notEnabled, setNotEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (!HIRING_ADMIN_ROLES.includes(currentUser.role)) {
      router.push('/dashboard');
      return;
    }
    setUser(currentUser);
  }, [router]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await hiringFetch<{ jobs: JobRow[] }>('/api/hiring/jobs');
      setJobs(data.jobs || []);
    } catch (err) {
      if (err instanceof HiringApiError && err.status === 403) {
        setNotEnabled(true);
      } else if (err instanceof HiringApiError && err.status === 401) {
        router.push('/login');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load jobs');
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (user) fetchJobs();
  }, [user, fetchJobs]);

  const openJobs = jobs.filter((j) => j.status !== 'closed');
  const closedJobs = jobs.filter((j) => j.status === 'closed');
  const shown = tab === 'open' ? openJobs : closedJobs;

  const goToJob = (id: string) => router.push(`/dashboard/hiring/jobs/${id}`);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-transparent">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <PageHeader
          backHref="/dashboard"
          backLabel="Dashboard"
          title="Job Board"
          subtitle="Social-media hiring ads + candidate pipeline"
          action={
            !notEnabled ? (
              <Button leftIcon={<Plus className="w-4 h-4" />} href="/dashboard/hiring/new">
                New Job
              </Button>
            ) : undefined
          }
        />

        {loading && (
          <div className="flex justify-center py-20"><Spinner size="lg" brand /></div>
        )}

        {!loading && notEnabled && (
          <Card>
            <EmptyState
              icon={Lock}
              title="Hiring isn't enabled for your company"
              description="The hiring module isn't part of your plan yet. Contact Pontifex to turn it on for your account."
            />
          </Card>
        )}

        {!loading && error && !notEnabled && (
          <Alert variant="danger" title="Couldn't load jobs">{error}</Alert>
        )}

        {!loading && !notEnabled && !error && (
          <>
            {/* Open / Closed tabs */}
            <div className="mb-4 flex items-center gap-1 border-b border-gray-200 dark:border-white/10">
              {([
                { value: 'open', label: `Open (${openJobs.length})` },
                { value: 'closed', label: `Closed (${closedJobs.length})` },
              ] as const).map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTab(t.value)}
                  className={`relative -mb-px min-h-[44px] whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors ${
                    tab === t.value
                      ? 'border-brand text-brand'
                      : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-white/60 dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Megaphone}
                  title={tab === 'open' ? 'No jobs yet' : 'No closed jobs'}
                  description={
                    tab === 'open'
                      ? 'Create your first job — we’ll build the ad, application form, and screener questions for you.'
                      : 'Jobs you close will show up here.'
                  }
                  action={
                    tab === 'open' ? (
                      <Button leftIcon={<Plus className="w-4 h-4" />} href="/dashboard/hiring/new">
                        Create your first job
                      </Button>
                    ) : undefined
                  }
                />
              </Card>
            ) : (
              <>
                {/* Desktop table */}
                <Card noPadding className="hidden md:block overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-white/10 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-white/50">
                          <th className="px-5 py-3">Job Title</th>
                          <th className="px-4 py-3">Location</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Impressions</th>
                          <th className="px-4 py-3 text-right">Clicks</th>
                          <th className="px-4 py-3 text-right">Candidates</th>
                          <th className="px-5 py-3 text-right">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                        {shown.map((job) => (
                          <tr
                            key={job.id}
                            onClick={() => goToJob(job.id)}
                            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                          >
                            <td className="px-5 py-3.5">
                              <span className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                                {job.title}
                                <LanguageBadge language={job.language} />
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-gray-600 dark:text-white/70">{job.location || '—'}</td>
                            <td className="px-4 py-3.5"><StatusPill status={job.status} /></td>
                            <td className="px-4 py-3.5 text-right tabular-nums text-gray-700 dark:text-white/80">
                              {fmtInt(job.impressions)}
                            </td>
                            <td className="px-4 py-3.5 text-right tabular-nums text-gray-700 dark:text-white/80">
                              {fmtInt(job.clicks)}
                              <span className="ml-1.5 text-xs text-gray-400 dark:text-white/40">
                                {clickRate(job.clicks, job.impressions)}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right tabular-nums text-gray-700 dark:text-white/80">
                              {job.candidate_count != null ? fmtInt(job.candidate_count) : '—'}
                            </td>
                            <td className="px-5 py-3.5 text-right text-gray-500 dark:text-white/50">
                              {fmtDateShort(job.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {shown.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => goToJob(job.id)}
                      className="w-full text-left rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 hover:border-brand/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                            <span className="truncate">{job.title}</span>
                            <LanguageBadge language={job.language} />
                          </p>
                          {job.location && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-white/50">
                              <MapPin className="w-3 h-3" /> {job.location}
                            </p>
                          )}
                        </div>
                        <StatusPill status={job.status} />
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-xs text-gray-600 dark:text-white/60">
                        <span className="tabular-nums">{fmtInt(job.impressions)} impr.</span>
                        <span className="tabular-nums">
                          {fmtInt(job.clicks)} clicks ({clickRate(job.clicks, job.impressions)})
                        </span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Users className="w-3.5 h-3.5" />
                          {job.candidate_count != null ? fmtInt(job.candidate_count) : '—'}
                        </span>
                        <ChevronRight className="ml-auto w-4 h-4 text-gray-300 dark:text-white/30" />
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
