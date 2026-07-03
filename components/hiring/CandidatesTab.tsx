'use client';

/**
 * CandidatesTab — candidate pipeline for one job: Unreviewed / Shortlisted /
 * Rejected sub-tabs with counts, search, Export CSV, and the candidate
 * slide-over (with prev/next walking the filtered list).
 */

import { useMemo, useState } from 'react';
import { Search, Download, ChevronRight, Users, AlertTriangle } from 'lucide-react';
import type { HiringCandidate, HiringJob, CandidateStatus } from '@/lib/hiring/types';
import { CANDIDATE_STATUSES } from '@/lib/hiring/types';
import { Card, EmptyState, Button, Alert } from '@/components/ui';
import CandidateSlideOver from './CandidateSlideOver';
import { getAccessToken, CANDIDATE_STATUS_PILL, fmtDateTime } from './api';

interface CandidatesTabProps {
  job: HiringJob;
  candidates: HiringCandidate[];
  /** Parent owns the list; applies status changes optimistically. */
  onCandidateStatus: (candidateId: string, status: CandidateStatus) => void;
}

const STATUS_TAB_LABEL: Record<CandidateStatus, string> = {
  unreviewed: 'Unreviewed',
  shortlisted: 'Shortlisted',
  rejected: 'Rejected',
};

export default function CandidatesTab({ job, candidates, onCandidateStatus }: CandidatesTabProps) {
  const [statusTab, setStatusTab] = useState<CandidateStatus>('unreviewed');
  const [query, setQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<CandidateStatus, number> = { unreviewed: 0, shortlisted: 0, rejected: 0 };
    candidates.forEach((x) => { c[x.status] = (c[x.status] || 0) + 1; });
    return c;
  }, [candidates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates
      .filter((c) => c.status === statusTab)
      .filter((c) =>
        !q ||
        c.full_name.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q),
      )
      .sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime());
  }, [candidates, statusTab, query]);

  const openCandidate = openIndex != null ? filtered[openIndex] ?? null : null;

  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setExportError('Your session expired — sign in again to export.');
        return;
      }
      const res = await fetch(`/api/hiring/jobs/${job.id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setExportError(`Export failed (${res.status}). Try again in a moment.`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${job.slug || 'candidates'}-candidates.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Export failed — check your connection and try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status sub-tabs + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-white/10 p-1 overflow-x-auto">
          {CANDIDATE_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setStatusTab(s); setOpenIndex(null); }}
              className={`min-h-[44px] px-4 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                statusTab === s
                  ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-white/60 hover:text-gray-800 dark:hover:text-white'
              }`}
            >
              {STATUS_TAB_LABEL[s]} ({counts[s]})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpenIndex(null); }}
              placeholder="Search candidates…"
              className="w-full sm:w-56 rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 pl-9 pr-3 py-2.5 min-h-[44px] text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>
          <Button
            variant="secondary"
            leftIcon={<Download className="w-4 h-4" />}
            loading={exporting}
            onClick={exportCsv}
          >
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">CSV</span>
          </Button>
        </div>
      </div>

      {exportError && (
        <Alert variant="danger" title="Couldn't export candidates" onDismiss={() => setExportError(null)}>
          {exportError}
        </Alert>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={query ? 'No matches' : `No ${STATUS_TAB_LABEL[statusTab].toLowerCase()} candidates`}
            description={
              query
                ? 'Try a different search.'
                : statusTab === 'unreviewed'
                  ? 'New applicants land here as soon as they apply.'
                  : `Candidates you ${statusTab === 'shortlisted' ? 'shortlist' : 'reject'} will show up here.`
            }
          />
        </Card>
      ) : (
        <Card noPadding>
          <ul className="divide-y divide-gray-100 dark:divide-white/10">
            {filtered.map((c, i) => {
              const pill = CANDIDATE_STATUS_PILL[c.status];
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(i)}
                    className="w-full min-h-[56px] flex items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="h-9 w-9 shrink-0 rounded-full bg-brand/10 text-brand flex items-center justify-center text-sm font-bold">
                      {c.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.full_name}</p>
                        {c.auto_rejected && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30">
                            <AlertTriangle className="w-3 h-3" /> Auto-rejected
                          </span>
                        )}
                        {c.language && c.language !== 'en' && (
                          <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand">
                            {c.language}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-white/50 truncate">
                        Applied {fmtDateTime(c.applied_at)}
                        {c.candidate_location ? ` · ${c.candidate_location}` : ''}
                      </p>
                    </div>
                    <span className={`hidden sm:inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${pill.className}`}>
                      {pill.label}
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0 text-gray-300 dark:text-white/30" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <CandidateSlideOver
        open={openIndex != null}
        candidate={openCandidate}
        jobTitle={job.title}
        onClose={() => setOpenIndex(null)}
        onStatusChange={onCandidateStatus}
        onPrev={() => setOpenIndex((i) => (i != null && i > 0 ? i - 1 : i))}
        onNext={() => setOpenIndex((i) => (i != null && i < filtered.length - 1 ? i + 1 : i))}
        hasPrev={openIndex != null && openIndex > 0}
        hasNext={openIndex != null && openIndex < filtered.length - 1}
      />
    </div>
  );
}
