'use client';

export const dynamic = 'force-dynamic';

/**
 * Job workspace — Hireline-style tabbed detail page:
 * Overview (funnel + status banner + recent candidates) / Ad Kit /
 * Screeners / Candidates / Settings.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Eye, MousePointerClick, Users, Play, Pause, ChevronRight, Lock,
} from 'lucide-react';
import { getCurrentUser, type User } from '@/lib/auth';
import type {
  HiringJob, HiringScreenerQuestion, HiringCandidate, CandidateStatus,
} from '@/lib/hiring/types';
import { HIRING_ADMIN_ROLES } from '@/lib/hiring/types';
import {
  Button, Card, EmptyState, PageHeader, Spinner, Alert, Tabs, TabList, Tab, TabPanel,
} from '@/components/ui';
import {
  hiringFetch, HiringApiError, JOB_STATUS_PILL, fmtInt, clickRate, applyRate,
  fmtDateTime, CANDIDATE_STATUS_PILL, LANGUAGE_LABELS,
} from '@/components/hiring/api';
import AdKitTab from '@/components/hiring/AdKitTab';
import ScreenerEditor from '@/components/hiring/ScreenerEditor';
import CandidatesTab from '@/components/hiring/CandidatesTab';
import JobSettingsTab from '@/components/hiring/JobSettingsTab';

/** GET /jobs/[id] returns { job, screeners, stats } — stats shape is loose. */
interface JobDetailPayload {
  job: HiringJob;
  screeners: HiringScreenerQuestion[];
  stats?: { candidates?: number; unreviewed?: number; shortlisted?: number; rejected?: number };
}

function FunnelStat({
  icon: Icon, label, value, rate, rateLabel,
}: {
  icon: typeof Eye; label: string; value: string; rate?: string; rateLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
      <div className="flex items-center gap-2 text-gray-500 dark:text-white/60">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="mt-3 text-3xl font-black tabular-nums text-gray-900 dark:text-white">{value}</p>
      {rate && (
        <p className="mt-1 text-xs text-gray-500 dark:text-white/50">
          <span className="font-bold text-gray-700 dark:text-white/80">{rate}</span> {rateLabel}
        </p>
      )}
    </div>
  );
}

export default function HiringJobDetailPage() {
  const [user, setUser] = useState<User | null>(null);
  const [job, setJob] = useState<HiringJob | null>(null);
  const [screeners, setScreeners] = useState<HiringScreenerQuestion[]>([]);
  const [candidates, setCandidates] = useState<HiringCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [notEnabled, setNotEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

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

  const fetchAll = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await hiringFetch<JobDetailPayload>(`/api/hiring/jobs/${jobId}`);
      setJob(detail.job);
      setScreeners(detail.screeners || []);
      try {
        const cand = await hiringFetch<{ candidates: HiringCandidate[] }>(
          `/api/hiring/jobs/${jobId}/candidates`,
        );
        setCandidates(cand.candidates || []);
      } catch {
        setCandidates([]);
      }
    } catch (err) {
      if (err instanceof HiringApiError && err.status === 403) {
        setNotEnabled(true);
      } else if (err instanceof HiringApiError && err.status === 401) {
        router.push('/login');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load job');
      }
    } finally {
      setLoading(false);
    }
  }, [jobId, router]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user, fetchAll]);

  const setJobStatus = async (status: HiringJob['status']) => {
    if (!job || statusSaving) return;
    setStatusSaving(true);
    try {
      const data = await hiringFetch<{ job: HiringJob }>(`/api/hiring/jobs/${job.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setJob(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setStatusSaving(false);
    }
  };

  const handleCandidateStatus = (candidateId: string, status: CandidateStatus) => {
    setCandidates((list) => list.map((c) => (c.id === candidateId ? { ...c, status } : c)));
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-transparent">
        <Spinner size="lg" brand />
      </div>
    );
  }

  if (notEnabled) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-transparent">
        <div className="mx-auto max-w-2xl px-4 py-16">
          <Card>
            <EmptyState
              icon={Lock}
              title="Hiring isn't enabled for your company"
              description="The hiring module isn't part of your plan yet. Contact Pontifex to turn it on for your account."
            />
          </Card>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-transparent">
        <div className="mx-auto max-w-2xl px-4 py-16">
          <Alert variant="danger" title="Job not found">
            {error || "This job doesn't exist or you don't have access to it."}
          </Alert>
          <div className="mt-4">
            <Button variant="secondary" href="/dashboard/hiring">Back to Job Board</Button>
          </div>
        </div>
      </div>
    );
  }

  const pill = JOB_STATUS_PILL[job.status] ?? JOB_STATUS_PILL.draft;
  const candidateCount = candidates.length;
  const recent = [...candidates]
    .sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime())
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-transparent">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <PageHeader
          backHref="/dashboard/hiring"
          backLabel="Job Board"
          title={
            <span className="flex flex-wrap items-center gap-2.5">
              {job.title}
              {job.language && job.language !== 'en' && (
                <span className="rounded bg-brand/10 px-2 py-0.5 text-xs font-bold uppercase text-brand">
                  {job.language}
                </span>
              )}
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${pill.className}`}>
                {pill.label}
              </span>
            </span>
          }
          subtitle={[job.location, LANGUAGE_LABELS[job.language] || job.language].filter(Boolean).join(' · ')}
        />

        {error && (
          <div className="mb-4">
            <Alert variant="danger" title="Something went wrong" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          </div>
        )}

        {/* Status banner */}
        {job.status === 'draft' && (
          <div className="mb-5">
            <Alert variant="info" title="This job is a draft">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span>The ad isn&apos;t running and candidates can&apos;t apply yet.</span>
                <Button size="sm" loading={statusSaving} leftIcon={<Play className="w-4 h-4" />}
                  onClick={() => setJobStatus('active')}>
                  Activate
                </Button>
              </div>
            </Alert>
          </div>
        )}
        {job.status === 'paused' && (
          <div className="mb-5">
            <Alert variant="warning" title="This job is paused">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span>The ad is stopped and new candidates can&apos;t apply.</span>
                <Button size="sm" loading={statusSaving} leftIcon={<Play className="w-4 h-4" />}
                  onClick={() => setJobStatus('active')}>
                  Reactivate
                </Button>
              </div>
            </Alert>
          </div>
        )}
        {job.status === 'active' && (
          <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3">
            <p className="flex-1 text-sm font-medium text-emerald-800 dark:text-emerald-300">
              This job is live — the ad is running and candidates can apply.
            </p>
            <Button size="sm" variant="secondary" loading={statusSaving}
              leftIcon={<Pause className="w-4 h-4" />} onClick={() => setJobStatus('paused')}>
              Pause
            </Button>
          </div>
        )}
        {job.status === 'closed' && (
          <div className="mb-5">
            <Alert variant="info" title="This job is closed">
              New applications are off. Your candidates remain accessible below.
            </Alert>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabList>
            <Tab value="overview">Overview</Tab>
            <Tab value="adkit">Ad Kit</Tab>
            <Tab value="screeners">Screeners{screeners.length ? ` (${screeners.length})` : ''}</Tab>
            <Tab value="candidates">Candidates{candidateCount ? ` (${candidateCount})` : ''}</Tab>
            <Tab value="settings">Settings</Tab>
          </TabList>

          {/* ─── Overview ─── */}
          <TabPanel value="overview">
            <div className="grid gap-4 sm:grid-cols-3">
              <FunnelStat
                icon={Eye}
                label="Impressions"
                value={fmtInt(job.impressions)}
              />
              <FunnelStat
                icon={MousePointerClick}
                label="Clicks"
                value={fmtInt(job.clicks)}
                rate={clickRate(job.clicks, job.impressions)}
                rateLabel="click rate"
              />
              <FunnelStat
                icon={Users}
                label="Candidates"
                value={fmtInt(candidateCount)}
                rate={applyRate(candidateCount, job.clicks)}
                rateLabel="apply rate"
              />
            </div>

            <div className="mt-6">
              <Card
                title="Recent candidates"
                action={
                  candidateCount > 0 ? (
                    <Button size="sm" variant="ghost" onClick={() => setActiveTab('candidates')}>
                      View all
                    </Button>
                  ) : undefined
                }
                noPadding={recent.length > 0}
              >
                {recent.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No candidates yet"
                    description={
                      job.status === 'active'
                        ? 'Your ad is live — applicants will show up here.'
                        : 'Activate the job to start collecting applicants.'
                    }
                  />
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-white/10">
                    {recent.map((c) => {
                      const cPill = CANDIDATE_STATUS_PILL[c.status];
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setActiveTab('candidates')}
                            className="w-full min-h-[52px] flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                          >
                            <div className="h-8 w-8 shrink-0 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold">
                              {c.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.full_name}</p>
                              <p className="text-xs text-gray-500 dark:text-white/50">Applied {fmtDateTime(c.applied_at)}</p>
                            </div>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cPill.className}`}>
                              {cPill.label}
                            </span>
                            <ChevronRight className="w-4 h-4 shrink-0 text-gray-300 dark:text-white/30" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          </TabPanel>

          {/* ─── Ad Kit ─── */}
          {/* keepMounted on adkit/screeners/settings: those panels hold
              unsaved form state — the UI kit unmounts inactive panels by
              default, which would silently destroy in-progress edits on a
              tab switch. */}
          <TabPanel value="adkit" keepMounted>
            <AdKitTab
              job={job}
              onJobUpdate={setJob}
              onRegenerated={(j, s) => { setJob(j); setScreeners(s); }}
            />
          </TabPanel>

          {/* ─── Screeners ─── */}
          <TabPanel value="screeners" keepMounted>
            <ScreenerEditor jobId={job.id} screeners={screeners} onSaved={setScreeners} />
          </TabPanel>

          {/* ─── Candidates ─── */}
          <TabPanel value="candidates">
            <CandidatesTab
              job={job}
              candidates={candidates}
              onCandidateStatus={handleCandidateStatus}
            />
          </TabPanel>

          {/* ─── Settings ─── */}
          <TabPanel value="settings" keepMounted>
            <JobSettingsTab job={job} onJobUpdate={setJob} />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
}
